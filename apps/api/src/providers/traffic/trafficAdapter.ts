import fs from 'fs';
import path from 'path';
import { TrafficObservation, TrafficIncident } from '@smartcity/shared';
import { TrafficProvider } from './trafficProvider.interface.js';
import { evaluateFreshness, DEFAULT_TRAFFIC_FRESHNESS_CONFIG } from '../common/freshness.js';
import { resolveMockPath } from '../../utils/mockPath.js';

export class TrafficAdapter implements TrafficProvider {
  public readonly name: string;
  public readonly isLive: boolean;

  constructor(name = 'metro-traffic-feed', isLive = false) {
    this.name = name;
    this.isLive = isLive;
  }

  private loadMockFlows() {
    try {
      const mockPath = resolveMockPath('mock/traffic.json');
      if (fs.existsSync(mockPath)) {
        return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return { flows: [] };
  }

  private loadMockIncidents() {
    try {
      const mockPath = resolveMockPath('mock/incidents.json');
      if (fs.existsSync(mockPath)) {
        return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return { incidents: [] };
  }

  async getTrafficFlows(bbox: [number, number, number, number]): Promise<TrafficObservation[]> {
    const raw = this.loadMockFlows();
    const flows = raw.flows || [];

    return flows.map((f: { segmentId: string; roadName: string; currentSpeedKmh: number; freeFlowSpeedKmh: number; delaySeconds: number; congestionScore: number; observedAt?: string }) => {
      const sourceTimestamp = f.observedAt || new Date().toISOString();
      const { freshness, dataAgeSeconds } = evaluateFreshness(
        sourceTimestamp,
        DEFAULT_TRAFFIC_FRESHNESS_CONFIG,
        new Date(),
        !this.isLive
      );

      return {
        segmentId: f.segmentId,
        roadName: f.roadName,
        timestamp: sourceTimestamp,
        receivedAt: new Date().toISOString(),
        speedKmh: Math.max(0, f.currentSpeedKmh ?? 30.0),
        freeFlowSpeedKmh: Math.max(1, f.freeFlowSpeedKmh ?? 50.0),
        delaySeconds: Math.max(0, f.delaySeconds ?? 0),
        congestionLevel: Math.min(100, Math.max(0, f.congestionScore ?? 20)),
        source: this.name,
        freshness: this.isLive ? freshness : 'MOCK',
        dataAgeSeconds,
      };
    });
  }

  async getIncidents(bbox: [number, number, number, number]): Promise<TrafficIncident[]> {
    const raw = this.loadMockIncidents();
    const incidents = raw.incidents || [];

    return incidents.map((inc: { id: string; type: string; severity: string; description: string; latitude: number; longitude: number; roadSegmentId?: string; isBlocking: boolean; startedAt?: string }) => {
      return {
        id: inc.id,
        type: (inc.type as any) || 'HAZARD',
        severity: (inc.severity as any) || 'MEDIUM',
        latitude: inc.latitude,
        longitude: inc.longitude,
        roadSegmentId: inc.roadSegmentId,
        description: inc.description,
        isBlocking: inc.isBlocking ?? false,
        startedAt: inc.startedAt || new Date().toISOString(),
        source: this.name,
        freshness: this.isLive ? 'LIVE' : 'MOCK',
      };
    });
  }
}
