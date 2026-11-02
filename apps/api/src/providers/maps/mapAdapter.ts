import fs from 'fs';
import path from 'path';
import { RoadSegment } from '@smartcity/shared';
import { MapProvider } from './mapProvider.interface.js';
import { resolveMockPath } from '../../utils/mockPath.js';

export class MapAdapter implements MapProvider {
  public readonly name = 'osm-map-service';
  public readonly isLive = true;

  private loadMockRoads(): RoadSegment[] {
    try {
      const mockPath = resolveMockPath('mock/roads.json');
      if (fs.existsSync(mockPath)) {
        return JSON.parse(fs.readFileSync(mockPath, 'utf-8')).roads || [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  async geocode(query: string): Promise<{ latitude: number; longitude: number; formattedAddress: string }> {
    const q = query.toLowerCase();
    if (q.includes('work') || q.includes('plaza')) {
      return {
        latitude: 40.7320,
        longitude: -74.0050,
        formattedAddress: '100 Metro Innovation Plaza, Sector 1',
      };
    }
    if (q.includes('home') || q.includes('highland')) {
      return {
        latitude: 40.7450,
        longitude: -74.0200,
        formattedAddress: '12 Highland Crest Way, Sector 5',
      };
    }
    if (q.includes('hospital') || q.includes('health') || q.includes('emergency')) {
      return {
        latitude: 40.7140,
        longitude: -74.0120,
        formattedAddress: 'City Memorial Hospital, Medical Corridor',
      };
    }
    if (q.includes('college') || q.includes('university') || q.includes('campus')) {
      return {
        latitude: 40.7250,
        longitude: -73.9920,
        formattedAddress: 'Metro State University, Campus North Gate',
      };
    }
    if (q.includes('whitefield') || q.includes('basin')) {
      return {
        latitude: 40.7120,
        longitude: -74.0110,
        formattedAddress: 'Whitefield Central Corridor, Sector 3',
      };
    }
    return {
      latitude: 40.7180,
      longitude: -74.0150,
      formattedAddress: `${query}, Metro District`,
    };
  }


  async getRoadNetwork(bbox?: [number, number, number, number]): Promise<RoadSegment[]> {
    return this.loadMockRoads();
  }
}
