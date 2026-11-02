import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { DomainEventEnvelope } from '@smartcity/shared';
import { dataAggregator } from '../services/dataAggregator.js';
import { logger } from '../utils/logger.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  subscriptions: Set<string>;
}

let activeWsServerInstance: RealtimeWebSocketServer | null = null;

export function getActiveWsServer(): RealtimeWebSocketServer | null {
  return activeWsServerInstance;
}

export class RealtimeWebSocketServer {
  private wss: WebSocketServer;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    activeWsServerInstance = this;
    this.initialize();
  }

  private initialize(): void {
    logger.info('Initializing Real-Time WebSocket Server on /ws');

    this.wss.on('connection', (socket: WebSocket) => {
      const extSocket = socket as ExtendedWebSocket;
      extSocket.isAlive = true;
      extSocket.subscriptions = new Set([
        'realtime:system',
        'realtime:weather',
        'realtime:traffic',
        'realtime:flood',
        'realtime:roads',
        'realtime:routing',
        'realtime:location_alert',
        'realtime:ai',
      ]);

      logger.info('Client connected to Real-Time WebSocket stream', {
        details: { totalClients: this.wss.clients.size },
      });

      // Send immediate welcome & initial state confirmation
      extSocket.send(
        JSON.stringify({
          topic: 'realtime:system',
          type: 'CONNECTION_ESTABLISHED',
          timestamp: new Date().toISOString(),
          subscriptions: Array.from(extSocket.subscriptions),
        })
      );

      extSocket.on('pong', () => {
        extSocket.isAlive = true;
      });

      extSocket.on('message', async (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.action === 'subscribe' && Array.isArray(parsed.topics)) {
            parsed.topics
              .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
              .forEach((t: string) => extSocket.subscriptions.add(t.trim()));
            extSocket.send(
              JSON.stringify({
                topic: 'realtime:system',
                type: 'SUBSCRIPTIONS_UPDATED',
                timestamp: new Date().toISOString(),
                subscriptions: Array.from(extSocket.subscriptions),
              })
            );
          } else if (parsed.action === 'unsubscribe' && Array.isArray(parsed.topics)) {
            parsed.topics.forEach((t: any) => {
              if (typeof t === 'string') extSocket.subscriptions.delete(t.trim());
            });
            extSocket.send(
              JSON.stringify({
                topic: 'realtime:system',
                type: 'SUBSCRIPTIONS_UPDATED',
                timestamp: new Date().toISOString(),
                subscriptions: Array.from(extSocket.subscriptions),
              })
            );
          } else if (parsed.action === 'ping') {
            extSocket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          } else if (parsed.action === 'location_update' && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
            // Evaluate location relevance securely without broadcasting private coordinates
            const { locationRelevanceService } = await import('../services/locationRelevance.service.js');
            const evaluation = await locationRelevanceService.evaluateLocationRelevance({
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              destination: parsed.destination,
              destinationCoordinates: parsed.destinationCoordinates,
              userId: parsed.userId || 'anonymous-user',
              language: parsed.language || 'en',
            });

            // Send evaluation ONLY to the requesting socket
            extSocket.send(
              JSON.stringify({
                topic: 'realtime:location_alert',
                type: 'LOCATION_RELEVANCE_UPDATED',
                timestamp: new Date().toISOString(),
                data: evaluation,
              })
            );
          } else if (parsed.action === 'broadcast' || parsed.action === 'admin_broadcast') {
            const p = parsed.alert || parsed.payload || parsed.data || {};
            const title = p.title || `🚨 EMERGENCY ALERT: ${p.location || 'Citywide Emergency'}`;
            const headline = p.headline || p.message || p.body || 'Disaster early warning transmitted by EOC Authority.';
            const broadcastMsg = {
              topic: 'realtime:broadcast',
              eventType: 'ADMIN_EMERGENCY_BROADCAST',
              timestamp: new Date().toISOString(),
              payload: {
                id: p.id || `admin-${Date.now()}`,
                title,
                headline,
                body: p.body || headline,
                severity: p.severity || 'CRITICAL',
                type: p.type || 'FLOOD',
                location: p.location || 'Bengaluru Catchment',
                waterDepthCm: p.waterDepthCm || 42,
                leadTimeMinutes: p.leadTimeMinutes || 15,
                recommendedAction: p.recommendedAction || 'Follow designated detours.',
                detourCorridor: p.detourCorridor || 'Elevated Expressway Bypass',
                coordinates: p.coordinates || [12.9172, 77.6228],
                dispatchedAt: new Date().toISOString(),
                source: 'EOC Emergency Broadcast Command',
                buzzerAlert: true,
              },
            };

            // Instant in-memory broadcast to ALL connected client sockets (< 1ms zero delay)
            this.broadcast('realtime:broadcast', broadcastMsg);
            this.broadcast('realtime:alerts', broadcastMsg);
            this.broadcast('realtime:system', broadcastMsg);
            this.broadcast('realtime:flood', broadcastMsg);
            this.broadcastAll(broadcastMsg);

            // Acknowledge back to sender
            extSocket.send(
              JSON.stringify({
                type: 'BROADCAST_ACK',
                status: 'DELIVERED',
                broadcastId: broadcastMsg.payload.id,
                timestamp: new Date().toISOString(),
              })
            );

            // Asynchronously record to NotificationQueue
            try {
              const { notificationQueueService } = await import('../services/notifications/notificationQueue.service.js');
              notificationQueueService.broadcastEmergencyAlert({
                title: broadcastMsg.payload.title,
                message: broadcastMsg.payload.body,
                severity: broadcastMsg.payload.severity as any,
                location: broadcastMsg.payload.location,
                waterDepthCm: broadcastMsg.payload.waterDepthCm,
                leadTimeMinutes: broadcastMsg.payload.leadTimeMinutes,
                recommendedAction: broadcastMsg.payload.recommendedAction,
                detourCorridor: broadcastMsg.payload.detourCorridor,
                coordinates: broadcastMsg.payload.coordinates as any,
              });
            } catch {}
          }
        } catch {
          // ignore malformed message
        }
      });


      extSocket.on('close', () => {
        logger.debug('Client disconnected from WebSocket stream');
      });
    });

    // 30s Heartbeat liveness check
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const extWs = ws as ExtendedWebSocket;
        if (!extWs.isAlive) {
          extWs.terminate();
          return;
        }
        extWs.isAlive = false;
        extWs.ping();
      });
    }, 30000);

    // Bridge domain events from DataAggregator to WebSockets
    dataAggregator.on('domain_event', (event: DomainEventEnvelope) => {
      let topic = 'realtime:system';
      if (event.event_type.startsWith('WEATHER')) topic = 'realtime:weather';
      else if (event.event_type.startsWith('TRAFFIC')) topic = 'realtime:traffic';
      else if (event.event_type.startsWith('FLOOD')) topic = 'realtime:flood';

      this.broadcast(topic, {
        topic,
        eventType: event.event_type,
        timestamp: event.timestamp,
        eventId: event.event_id,
        source: event.source,
        payload: event.payload,
      });
    });

    // Bridge domain events from FloodIntelligenceService to WebSockets
    import('../services/flood/floodIntelligence.service.js')
      .then(({ floodIntelligenceService }) => {
        floodIntelligenceService.on('domain_event', (event: DomainEventEnvelope) => {
          this.broadcast('realtime:flood', {
            topic: 'realtime:flood',
            eventType: event.event_type,
            timestamp: event.timestamp,
            eventId: event.event_id,
            source: event.source,
            payload: event.payload,
          });
        });
      })
      .catch(() => {});

    // Bridge domain events from GrokDecisionService to WebSockets
    import('../services/ai/GrokDecisionService.js')
      .then(({ grokDecisionService }) => {
        grokDecisionService.on('domain_event', (event: DomainEventEnvelope) => {
          this.broadcast('realtime:ai', {
            topic: 'realtime:ai',
            eventType: event.event_type,
            timestamp: event.timestamp,
            eventId: event.event_id,
            source: event.source,
            payload: event.payload,
          });
        });
      })
      .catch(() => {});

    // Bridge domain events from TrafficIntelligenceService to WebSockets
    import('../services/traffic/trafficIntelligence.service.js')
      .then(({ trafficIntelligenceService }) => {
        trafficIntelligenceService.on('domain_event', (event: DomainEventEnvelope) => {
          this.broadcast('realtime:traffic', {
            topic: 'realtime:traffic',
            eventType: event.event_type,
            timestamp: event.timestamp,
            eventId: event.event_id,
            source: event.source,
            payload: event.payload,
          });
        });
      })
      .catch(() => {});

    // Bridge domain events from RoadRiskService to WebSockets
    import('../services/roads/roadRisk.service.js')
      .then(({ roadRiskService }) => {
        roadRiskService.on('domain_event', (event: DomainEventEnvelope) => {
          this.broadcast('realtime:roads', {
            topic: 'realtime:roads',
            eventType: event.event_type,
            timestamp: event.timestamp,
            eventId: event.event_id,
            source: event.source,
            payload: event.payload,
          });
        });
      })
      .catch(() => {});

    // Bridge domain events from ActiveRouteService to WebSockets
    import('../services/routing/activeRoute.service.js')
      .then(({ activeRouteService }) => {
        activeRouteService.on('domain_event', (event: DomainEventEnvelope) => {
          this.broadcast('realtime:routing', {
            topic: 'realtime:routing',
            eventType: event.event_type,
            timestamp: event.timestamp,
            eventId: event.event_id,
            source: event.source,
            payload: event.payload,
          });

          // User-scoped private broadcast
          const payload = event.payload as { userId?: string } | undefined;
          if (payload?.userId) {
            this.broadcast(`user:${payload.userId}`, {
              topic: `user:${payload.userId}`,
              eventType: event.event_type,
              timestamp: event.timestamp,
              eventId: event.event_id,
              source: event.source,
              payload: event.payload,
            });
          }
        });
      })
      .catch(() => {});

    // Bridge domain events from NotificationQueueService to WebSockets for instant citywide broadcast
    import('../services/notifications/notificationQueue.service.js')
      .then(({ notificationQueueService }) => {
        notificationQueueService.on('domain_event', (event: DomainEventEnvelope) => {
          const broadcastMsg = {
            topic: 'realtime:broadcast',
            eventType: event.event_type,
            timestamp: event.timestamp,
            eventId: event.event_id,
            source: event.source,
            payload: event.payload,
          };
          this.broadcast('realtime:broadcast', broadcastMsg);
          this.broadcast('realtime:alerts', broadcastMsg);
          this.broadcast('realtime:system', broadcastMsg);
          this.broadcast('realtime:flood', broadcastMsg);
          // Broadcast to every connected client on every device
          this.broadcastAll(broadcastMsg);
        });
      })
      .catch(() => {});
  }

  public broadcast(topic: string, message: unknown): void {
    const payload = JSON.stringify(message);

    this.wss.clients.forEach((client) => {
      const extClient = client as ExtendedWebSocket;
      if (extClient.readyState === WebSocket.OPEN && extClient.subscriptions.has(topic)) {
        extClient.send(payload);
      }
    });
  }

  public broadcastAll(message: unknown): void {
    const payload = JSON.stringify(message);

    this.wss.clients.forEach((client) => {
      const extClient = client as ExtendedWebSocket;
      if (extClient.readyState === WebSocket.OPEN) {
        extClient.send(payload);
      }
    });
  }

  public getClientCount(): number {
    return this.wss.clients.size;
  }

  public close(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}
