import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DomainEventEnvelope,
  FloodSeverity,
  RoadAccessibility,
  RoadRiskRecord,
  TrafficState,
} from '@smartcity/shared';
import { roadFloodRiskService } from '../flood/roadFloodRisk.service.js';
import { floodIntelligenceService } from '../flood/floodIntelligence.service.js';
import { trafficIntelligenceService } from '../traffic/trafficIntelligence.service.js';
import { dataAggregator } from '../dataAggregator.js';
import { logger } from '../../utils/logger.js';
import { resolveMockPath } from '../../utils/mockPath.js';

interface RawRoad {
  id: string;
  name: string;
  roadClass: string;
  lengthMeters: number;
  speedLimitKmh: number;
  floodScore: number;
  trafficScore: number;
  compositeRisk: number;
  accessibilityState: RoadAccessibility;
  confidence: number;
  isHistoricallyFloodProne: boolean;
  coordinates: [number, number][];
  blockageReason?: string | null;
}

export class RoadRiskService extends EventEmitter {
  private cachedRoads: RawRoad[] = [];
  private currentRiskMap: Map<string, RoadRiskRecord> = new Map();
  private lastEvaluatedAt = '';
  private activeEvaluationPromise?: Promise<RoadRiskRecord[]>;

  constructor() {
    super();
    this.loadRoads();
    this.initListeners();
  }

  private loadRoads(): void {
    try {
      const mockPath = resolveMockPath('mock/roads.json');
      if (fs.existsSync(mockPath)) {
        const parsed = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
        this.cachedRoads = parsed.roads || [];
      }
    } catch {
      this.cachedRoads = [];
    }
  }

  private initListeners(): void {
    // Re-evaluate whenever flood risk changes
    floodIntelligenceService.on('domain_event', (event: DomainEventEnvelope) => {
      if (event.event_type === 'FLOOD_RISK_CHANGED' || event.event_type === 'FLOOD_DATA_UPDATED') {
        this.evaluateAllRoadRisks().catch(() => {});
      }
    });

    // Re-evaluate whenever traffic state changes
    trafficIntelligenceService.on('domain_event', (event: DomainEventEnvelope) => {
      if (event.event_type === 'TRAFFIC_STATE_UPDATED') {
        this.evaluateAllRoadRisks().catch(() => {});
      }
    });
  }

  /**
   * Combines flood, traffic, and incident states into a unified road risk record
   * while preserving individual components for total algorithmic explainability
   */
  public async evaluateAllRoadRisks(): Promise<RoadRiskRecord[]> {
    if (this.activeEvaluationPromise) {
      return this.activeEvaluationPromise;
    }

    this.activeEvaluationPromise = (async () => {
      try {
        if (this.cachedRoads.length === 0) {
          this.loadRoads();
        }

        const floodEval = floodIntelligenceService.getLastEvaluation() || (await floodIntelligenceService.evaluateRisk());
        const activeZones = floodEval.zones || [];
        const floodRoads = roadFloodRiskService.evaluateRoadRisks(activeZones, floodEval.currentRisk.compositeScore ?? (floodEval.currentRisk as any).score ?? 0);
        const trafficRoads = await trafficIntelligenceService.getRoadTrafficStates();
        const { incidents } = await dataAggregator.refreshTraffic();

    const trafficMap = new Map(trafficRoads.map((t) => [t.segmentId, t]));
    const floodMap = new Map(floodRoads.map((f) => [f.roadId, f]));

    const incidentsByRoad = new Map<string, typeof incidents>();
    for (const inc of incidents) {
      if (inc.roadSegmentId) {
        const list = incidentsByRoad.get(inc.roadSegmentId) || [];
        list.push(inc);
        incidentsByRoad.set(inc.roadSegmentId, list);
      }
    }

    const results: RoadRiskRecord[] = [];
    let hasMaterialChange = false;

    for (const road of this.cachedRoads) {
      const fInfo = floodMap.get(road.id);
      const tInfo = trafficMap.get(road.id);
      const roadIncidents = incidentsByRoad.get(road.id) || [];

      // Extract components
      const floodScore = fInfo ? fInfo.floodScore : road.floodScore;
      const floodState: FloodSeverity = fInfo ? fInfo.riskState : 'NORMAL';

      const trafficScore = tInfo ? tInfo.score : road.trafficScore;
      const trafficState: TrafficState = tInfo ? tInfo.state : 'SMOOTH';
      const delayRatio = tInfo ? tInfo.delayFactor : 1.0;

      const incidentScore = tInfo ? tInfo.incidentRisk : 0;
      const hasBlockingIncident = roadIncidents.some((i) => i.isBlocking || i.type === 'CLOSURE');

      // Check physical obstruction
      const isSubmerged = fInfo?.accessibilityState === 'BLOCKED' || (road.blockageReason !== null && road.blockageReason !== undefined && road.accessibilityState === 'BLOCKED');
      const isHardBlocked = isSubmerged || hasBlockingIncident;

      // Combined overall mobility risk calculation
      let overallRisk = 0;
      let accessibility: RoadAccessibility = 'OPEN';
      let reason = 'Normal operating conditions';

      if (isHardBlocked) {
        overallRisk = 100.0;
        accessibility = 'BLOCKED';
        reason = road.blockageReason || (hasBlockingIncident ? 'Road blocked by emergency barrier or accident' : 'Road submerged under hazardous water levels');
      } else {
        const floodWeight = 0.55;
        const trafficWeight = 0.30;
        const incidentWeight = 0.15;

        overallRisk = Number(
          Math.min(100, floodWeight * floodScore + trafficWeight * trafficScore + incidentWeight * incidentScore).toFixed(1)
        );

        if (overallRisk >= 75 || floodScore >= 75) {
          accessibility = 'HIGH_RISK';
          reason = 'Severe flood hazard or impassable congestion; detour strongly recommended';
        } else if (overallRisk >= 45 || floodScore >= 45 || trafficScore >= 60) {
          accessibility = 'CAUTION';
          reason = 'Elevated caution: localized water accumulation or heavy traffic delays';
        } else {
          accessibility = 'OPEN';
          reason = 'Road corridor is clear and operating under normal safety limits';
        }
      }

      const record: RoadRiskRecord = {
        roadId: road.id,
        roadName: road.name,
        traffic: {
          score: trafficScore,
          state: trafficState,
          delayRatio,
          currentSpeedKmh: tInfo?.currentSpeedKmh ?? road.speedLimitKmh,
          freeFlowSpeedKmh: tInfo?.freeFlowSpeedKmh ?? road.speedLimitKmh,
        },
        flood: {
          score: floodScore,
          state: floodState,
          waterDepthCm: isSubmerged ? 25.0 : 0.0,
        },
        incident: {
          score: incidentScore,
          activeIncidents: roadIncidents.length,
          isBlocking: isHardBlocked,
        },
        accessibility,
        accessibilityState: accessibility,
        overallRisk,
        overallMobilityRisk: overallRisk,
        floodRisk: floodScore,
        trafficRisk: trafficScore,
        incidentRisk: incidentScore,
        confidence: Math.min(road.confidence, tInfo?.confidence ?? 1.0),
        freshness: 'LIVE',
        reason,
        blockageReason: isHardBlocked ? reason : null,
        updatedAt: new Date().toISOString(),
      };

      const previous = this.currentRiskMap.get(road.id);
      if (!previous || previous.accessibility !== accessibility || Math.abs(previous.overallRisk - overallRisk) >= 15) {
        hasMaterialChange = true;
      }

      this.currentRiskMap.set(road.id, record);
      results.push(record);
    }

    this.lastEvaluatedAt = new Date().toISOString();

    if (hasMaterialChange && results.length > 0) {
      this.emitDomainEvent('ROAD_RISK_UPDATED', {
        summary: `Road network risk re-evaluated across ${results.length} segments`,
        evaluatedAt: this.lastEvaluatedAt,
        roads: results,
      });
    }

      return results;
    } finally {
      this.activeEvaluationPromise = undefined;
    }
  })();

  return this.activeEvaluationPromise;
}

  /**
   * Retrieves all current road risk records
   */
  public async getRoadRisks(): Promise<RoadRiskRecord[]> {
    if (this.currentRiskMap.size === 0) {
      return this.evaluateAllRoadRisks();
    }
    return Array.from(this.currentRiskMap.values());
  }

  /**
   * Retrieves risk record for a single road
   */
  public async getRoadRisk(roadId: string): Promise<RoadRiskRecord | null> {
    if (!this.currentRiskMap.has(roadId)) {
      await this.getRoadRisks();
    }
    return this.currentRiskMap.get(roadId) || null;
  }

  private emitDomainEvent<T>(eventType: any, payload: T): void {
    const event: DomainEventEnvelope<T> = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      source: 'road-risk-service',
      correlation_id: crypto.randomUUID(),
      payload,
    };
    this.emit('domain_event', event);
  }
}

export const roadRiskService = new RoadRiskService();
