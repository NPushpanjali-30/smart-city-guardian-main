import { EventEmitter } from 'events';
import crypto from 'crypto';
import {
  ActiveRouteSession,
  CandidateRouteOutput,
  DomainEventEnvelope,
  RerouteTriggerType,
  RouteVersionRecord,
} from '@smartcity/shared';
import { routingEngine } from './routingEngine.service.js';
import { reroutingPolicyService } from './reroutingPolicy.service.js';
import { roadRiskService } from '../roads/roadRisk.service.js';
import { notificationQueueService } from '../notifications/notificationQueue.service.js';
import { userPreferenceService } from '../notifications/userPreference.service.js';
import { formatLocalizedAlert } from '@smartcity/shared';
import { logger } from '../../utils/logger.js';

export class ActiveRouteService extends EventEmitter {
  private activeSessions: Map<string, ActiveRouteSession> = new Map(); // keyed by sessionId
  private routeToSessionMap: Map<string, string> = new Map(); // routeId -> sessionId

  constructor() {
    super();
    this.initListeners();
  }

  private initListeners(): void {
    // Listen for road risk updates to dynamically evaluate active routes
    roadRiskService.on('domain_event', (event: DomainEventEnvelope) => {
      if (event.event_type === 'ROAD_RISK_UPDATED') {
        const payload = event.payload as { roads?: any[] } | undefined;
        if (payload?.roads) {
          this.evaluateAllActiveRoutes(payload.roads).catch((err) => {
            logger.error('Error evaluating active routes on road risk update', { error: String(err) });
          });
        }
      }
    });
  }

  /**
   * Starts an active navigation session for a commuter
   */
  public async startRoute(routeId: string, userId = 'citizen-user'): Promise<ActiveRouteSession> {
    let route = routingEngine.getRouteById(routeId);

    if (!route) {
      // Fallback: calculate default route
      const result = await routingEngine.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.0060, name: 'City Center' },
        destination: { latitude: 40.7450, longitude: -74.0200, name: 'Highland Crest' },
        userId,
      });
      route = result.recommendedRoute;
    }

    const sessionId = `session-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const session: ActiveRouteSession = {
      sessionId,
      routeId: route.routeId,
      userId,
      origin: route.origin,
      destination: route.destination,
      currentRouteVersion: 1,
      status: 'ACTIVE',
      currentRoute: route,
      startedAt: now,
      lastEvaluatedAt: now,
    };

    this.activeSessions.set(sessionId, session);
    this.routeToSessionMap.set(route.routeId, sessionId);

    // Record initial version 1
    reroutingPolicyService.recordVersion(
      sessionId,
      route,
      1,
      'MANUAL',
      'Initial navigation route started'
    );

    this.emitDomainEvent('ROUTE_CREATED', {
      userId,
      sessionId,
      routeId: route.routeId,
      version: 1,
      origin: route.origin,
      destination: route.destination,
      status: route.status,
      startedAt: now,
    });

    logger.info('Active navigation session started', { sessionId, routeId: route.routeId, userId });
    return session;
  }

  /**
   * Stops an active navigation session
   */
  public stopRoute(identifier: string): ActiveRouteSession | null {
    const session = this.findSession(identifier);
    if (!session) return null;

    session.status = 'COMPLETED';
    session.lastEvaluatedAt = new Date().toISOString();

    this.emitDomainEvent('ROUTE_UPDATED', {
      userId: session.userId,
      sessionId: session.sessionId,
      routeId: session.routeId,
      status: 'COMPLETED',
      completedAt: session.lastEvaluatedAt,
    });

    logger.info('Active navigation session concluded', { sessionId: session.sessionId, routeId: session.routeId });
    return session;
  }

  /**
   * Evaluates all currently active navigation sessions against new road conditions
   */
  public async evaluateAllActiveRoutes(latestRoadRisks: any[]): Promise<void> {
    for (const session of this.activeSessions.values()) {
      if (session.status !== 'ACTIVE') continue;

      const evalResult = await reroutingPolicyService.evaluateActiveRoute(session, latestRoadRisks);

      session.lastEvaluatedAt = new Date().toISOString();

      if (evalResult.rerouteRequired && evalResult.suggestedRoute) {
        const oldRouteId = session.routeId;
        const newRoute = evalResult.suggestedRoute;
        const newVersion = session.currentRouteVersion + 1;

        session.routeId = newRoute.routeId;
        session.currentRouteVersion = newVersion;
        session.currentRoute = newRoute;
        session.lastRerouteAt = session.lastEvaluatedAt;

        // Set cooldown unless emergency blockage override
        if (!evalResult.bypassedCooldown) {
          const cooldownMs = 90 * 1000;
          session.cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
        } else {
          session.cooldownUntil = undefined;
        }

        this.routeToSessionMap.set(newRoute.routeId, session.sessionId);

        // Record version
        reroutingPolicyService.recordVersion(
          session.sessionId,
          newRoute,
          newVersion,
          evalResult.trigger || 'ROAD_BLOCKED',
          evalResult.reason
        );

        // Emit ROUTE_RECALCULATED
        this.emitDomainEvent('ROUTE_RECALCULATED', {
          userId: session.userId,
          sessionId: session.sessionId,
          oldRouteId,
          newRouteId: newRoute.routeId,
          version: newVersion,
          reason: evalResult.reason,
          trigger: evalResult.trigger,
          timestamp: session.lastEvaluatedAt,
          suggestedRoute: newRoute,
        });

        // Trigger Phase 7/8 Notification Policy Engine evaluation and Localized SMS dispatch
        try {
          const userPrefs = userPreferenceService.getPreferences(session.userId);
          const lang = userPrefs.preferredLanguage || 'en';
          const detourName = (newRoute as any).recommendedDetourName || 'Highland Parkway Bypass';
          const travelDelta = Math.max(
            1,
            Math.round(
              (newRoute.estimatedTravelTimeSeconds - (session.currentRoute.estimatedTravelTimeSeconds || 0)) / 60
            )
          );

          const routeSeverity: 'CRITICAL' | 'WARNING' | 'WATCH' =
            evalResult.trigger === 'FLOOD_RISK_SURGE' ||
            evalResult.trigger === 'HIGH_RISK_TRANSITION' ||
            evalResult.trigger === 'NEW_INCIDENT' ||
            evalResult.bypassedCooldown ||
            newRoute.status === 'HIGH_RISK' ||
            newRoute.isBlocked
              ? 'CRITICAL'
              : 'WARNING';

          const candidate = {
            userId: session.userId,
            eventId: `reroute-${session.sessionId}-v${newVersion}`,
            eventName: evalResult.reason || 'Road Blockage / Flood Detour',
            severity: routeSeverity,
            triggerType: 'ROUTE_ALERT' as const,
            channel: 'SMS' as const,
            eventCoordinates: [newRoute.origin.latitude, newRoute.origin.longitude] as [number, number],
            userCoordinates: [session.origin.latitude, session.origin.longitude] as [number, number],
            destinationCoordinates: [session.destination.latitude, session.destination.longitude] as [number, number],
            routeCoordinates: newRoute.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]),
          };

          const localized = formatLocalizedAlert({
            template: 'ROUTE_ALERT',
            language: lang,
            severity: candidate.severity,
            eventName: candidate.eventName,
            distanceKm: (newRoute.distanceMeters || 1000) / 1000,
            routeDetourName: detourName,
            travelTimeDeltaMin: travelDelta,
          });

          await notificationQueueService.enqueue({
            candidate,
            message: localized.smsSummary,
            triggerType: 'ROUTE_ALERT',
            channel: 'SMS',
            language: lang,
          });
        } catch (notifErr) {
          logger.warn('Failed to enqueue automatic reroute notification', { error: String(notifErr) });
        }

        logger.info('Active route dynamically recalculated', {
          sessionId: session.sessionId,
          oldRouteId,
          newRouteId: newRoute.routeId,
          version: newVersion,
          trigger: evalResult.trigger,
          reason: evalResult.reason,
        });
      }
    }
  }

  /**
   * Triggers manual or explicit recalculation for a session
   */
  public async recalculateRoute(
    identifier: string,
    trigger: RerouteTriggerType = 'MANUAL'
  ): Promise<{ session: ActiveRouteSession; rerouted: boolean; reason: string }> {
    const session = this.findSession(identifier);
    if (!session) {
      throw new Error(`Active route session for identifier '${identifier}' not found`);
    }

    const calcResult = await routingEngine.calculateRoutes({
      origin: session.origin,
      destination: session.destination,
      userId: session.userId,
    });

    const newRoute = calcResult.recommendedRoute;
    const oldRouteId = session.routeId;
    const newVersion = session.currentRouteVersion + 1;

    session.routeId = newRoute.routeId;
    session.currentRouteVersion = newVersion;
    session.currentRoute = newRoute;
    session.lastEvaluatedAt = new Date().toISOString();
    session.lastRerouteAt = session.lastEvaluatedAt;
    session.cooldownUntil = new Date(Date.now() + 90 * 1000).toISOString();

    this.routeToSessionMap.set(newRoute.routeId, session.sessionId);

    reroutingPolicyService.recordVersion(
      session.sessionId,
      newRoute,
      newVersion,
      trigger,
      `Manual recalculation: ${calcResult.decisionReason}`
    );

    this.emitDomainEvent('ROUTE_RECALCULATED', {
      userId: session.userId,
      sessionId: session.sessionId,
      oldRouteId,
      newRouteId: newRoute.routeId,
      version: newVersion,
      reason: `Route recalculated: ${calcResult.decisionReason}`,
      trigger,
      timestamp: session.lastEvaluatedAt,
    });

    return {
      session,
      rerouted: true,
      reason: calcResult.decisionReason,
    };
  }

  /**
   * Helper to locate session by sessionId or routeId
   */
  public findSession(identifier: string): ActiveRouteSession | null {
    if (this.activeSessions.has(identifier)) {
      return this.activeSessions.get(identifier) || null;
    }
    const sessionId = this.routeToSessionMap.get(identifier);
    if (sessionId && this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId) || null;
    }
    return null;
  }

  public getSessionVersions(identifier: string): RouteVersionRecord[] {
    const session = this.findSession(identifier);
    if (session) {
      const bySession = reroutingPolicyService.getVersionHistory(session.sessionId);
      if (bySession.length > 0) return bySession;
      const byRoute = reroutingPolicyService.getVersionHistory(session.routeId);
      if (byRoute.length > 0) return byRoute;
    }
    return reroutingPolicyService.getVersionHistory(identifier);
  }

  public getActiveSessionForUser(userId: string): ActiveRouteSession | null {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId && session.status === 'ACTIVE') {
        return session;
      }
    }
    return null;
  }

  public getAllActiveSessions(): ActiveRouteSession[] {
    return Array.from(this.activeSessions.values());
  }

  private emitDomainEvent<T>(eventType: any, payload: T): void {
    const event: DomainEventEnvelope<T> = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      source: 'active-route-service',
      correlation_id: crypto.randomUUID(),
      payload,
    };
    this.emit('domain_event', event);
  }
}

export const activeRouteService = new ActiveRouteService();
