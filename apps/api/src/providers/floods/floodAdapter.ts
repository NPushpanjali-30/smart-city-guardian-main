import fs from 'fs';
import path from 'path';
import { FloodObservation } from '@smartcity/shared';
import { FloodProvider } from './floodProvider.interface.js';
import { evaluateFreshness, DEFAULT_FLOOD_FRESHNESS_CONFIG } from '../common/freshness.js';
import { resolveMockPath } from '../../utils/mockPath.js';

export class FloodAdapter implements FloodProvider {
  public readonly name: string;
  public readonly isLive: boolean;

  constructor(name = 'metro-hydrology-service', isLive = false) {
    this.name = name;
    this.isLive = isLive;
  }

  private loadMockFlood() {
    try {
      const mockPath = resolveMockPath('mock/flood.json');
      if (fs.existsSync(mockPath)) {
        return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return { zones: [] };
  }

  async getFloodObservations(areaId?: string): Promise<FloodObservation[]> {
    const raw = this.loadMockFlood();
    const zones = raw.zones || [];

    return zones.map((z: { zoneId: string; zoneName: string; waterDepthCm: number; severity: string }) => {
      const observedAt = raw.evaluatedAt || new Date().toISOString();
      const { freshness, dataAgeSeconds } = evaluateFreshness(
        observedAt,
        DEFAULT_FLOOD_FRESHNESS_CONFIG,
        new Date(),
        !this.isLive
      );

      return {
        id: `fld_obs_${z.zoneId}`,
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        waterDepthCm: z.waterDepthCm ?? 0,
        severity: (z.severity as any) || 'NORMAL',
        observedAt,
        source: this.name,
        isLive: this.isLive,
        freshness: this.isLive ? freshness : 'MOCK',
        dataAgeSeconds,
      };
    });
  }

  async getFloodZones(areaId?: string): Promise<Array<Record<string, unknown>>> {
    const raw = this.loadMockFlood();
    return raw.zones || [];
  }
}
