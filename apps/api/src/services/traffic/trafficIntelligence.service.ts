import { EventEmitter } from 'events';
import crypto from 'crypto';
import {
  DomainEventEnvelope,
  ExplainableTrafficScoreResult,
  TrafficIncident,
  TrafficObservation,
  TrafficState,
  calculateTrafficScore,
} from '@smartcity/shared';
import { dataAggregator } from '../dataAggregator.js';
import { logger } from '../../utils/logger.js';

export interface RoadTrafficState extends ExplainableTrafficScoreResult {
  segmentId: string;
  roadId: string;
  roadName: string;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  traffic: {
    score: number;
    state: TrafficState;
    delayFactor: number;
  };
}

export class TrafficIntelligenceService extends EventEmitter {
  private roadTrafficMap: Map<string, RoadTrafficState> = new Map();
  private lastEvaluatedAt = '';

  constructor() {
    super();
    this.initListeners();
  }

  private initListeners(): void {
    // Listen for raw traffic updates from dataAggregator
    dataAggregator.on('domain_event', (event: DomainEventEnvelope) => {
      if (event.event_type === 'TRAFFIC_UPDATED' || event.event_type === 'TRAFFIC_INCIDENT_UPDATED') {
        const payload = event.payload as { flows?: TrafficObservation[]; incidents?: TrafficIncident[] } | undefined;
        if (payload?.flows) {
          this.processTrafficTelemetry(payload.flows, payload.incidents || []);
        }
      }
    });
  }

  /**
   * Normalizes raw traffic flows and incidents into road-level traffic states
   */
  public processTrafficTelemetry(
    flows: TrafficObservation[] = [],
    incidents: TrafficIncident[] = []
  ): RoadTrafficState[] {
    const results: RoadTrafficState[] = [];
    let hasMaterialChange = false;

    // Index incidents by road segment id
    const incidentsByRoad = new Map<string, TrafficIncident[]>();
    for (const inc of incidents) {
      if (inc.roadSegmentId) {
        const list = incidentsByRoad.get(inc.roadSegmentId) || [];
        list.push(inc);
        incidentsByRoad.set(inc.roadSegmentId, list);
      }
    }

    for (const flow of flows) {
      const roadIncidents = incidentsByRoad.get(flow.segmentId) || [];
      const freeFlow = flow.freeFlowSpeedKmh || 50.0;
      const baseTravelTimeSeconds = (1000 / (freeFlow * 1000 / 3600)); // normalized 1km time in seconds

      const evalResult = calculateTrafficScore({
        speedKmh: flow.speedKmh,
        freeFlowSpeedKmh: freeFlow,
        delaySeconds: flow.delaySeconds,
        freeFlowTravelTimeSeconds: baseTravelTimeSeconds,
        congestionLevel: flow.congestionLevel,
        incidents: roadIncidents,
        dataAgeSeconds: flow.dataAgeSeconds,
        freshness: flow.freshness,
      });

      const roadState: RoadTrafficState = {
        segmentId: flow.segmentId,
        roadId: flow.segmentId,
        roadName: flow.roadName,
        currentSpeedKmh: flow.speedKmh,
        freeFlowSpeedKmh: freeFlow,
        traffic: {
          score: evalResult.score,
          state: evalResult.state,
          delayFactor: evalResult.delayFactor,
        },
        ...evalResult,
      };

      const previous = this.roadTrafficMap.get(flow.segmentId);
      if (!previous || previous.state !== roadState.state || Math.abs(previous.score - roadState.score) >= 15) {
        hasMaterialChange = true;
      }

      this.roadTrafficMap.set(flow.segmentId, roadState);
      results.push(roadState);
    }

    this.lastEvaluatedAt = new Date().toISOString();

    if (hasMaterialChange && results.length > 0) {
      this.emitDomainEvent('TRAFFIC_STATE_UPDATED', {
        summary: `Traffic intelligence updated across ${results.length} road corridors`,
        evaluatedAt: this.lastEvaluatedAt,
        roads: results,
      });
    }

    return results;
  }

  /**
   * Retrieves all normalized road traffic states
   */
  public async getRoadTrafficStates(): Promise<RoadTrafficState[]> {
    if (this.roadTrafficMap.size === 0) {
      const { flows, incidents } = await dataAggregator.refreshTraffic();
      return this.processTrafficTelemetry(flows, incidents);
    }
    return Array.from(this.roadTrafficMap.values());
  }

  public async getAllRoadStates(): Promise<RoadTrafficState[]> {
    return this.getRoadTrafficStates();
  }

  /**
   * Retrieves traffic state for a specific road segment
   */
  public async getRoadTraffic(roadId: string): Promise<RoadTrafficState | null> {
    if (!this.roadTrafficMap.has(roadId)) {
      await this.getRoadTrafficStates();
    }
    return this.roadTrafficMap.get(roadId) || null;
  }

  private emitDomainEvent<T>(eventType: any, payload: T): void {
    const event: DomainEventEnvelope<T> = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      source: 'traffic-intelligence-service',
      correlation_id: crypto.randomUUID(),
      payload,
    };
    this.emit('domain_event', event);
  }
}

export const trafficIntelligenceService = new TrafficIntelligenceService();
