import fs from 'fs';
import path from 'path';
import {
  RoadFloodRiskResult,
  RoadAccessibility,
  FloodSeverity,
  GeographicRiskZone,
} from '@smartcity/shared';
import { evaluateRoadSegmentRisk, classifyFloodSeverity } from '@smartcity/shared';
import { resolveMockPath } from '../../utils/mockPath.js';

interface RawRoad {
  id: string;
  name: string;
  roadClass: string;
  floodScore: number;
  trafficScore: number;
  compositeRisk: number;
  accessibilityState: RoadAccessibility;
  confidence: number;
  isHistoricallyFloodProne: boolean;
  coordinates: [number, number][]; // [lon, lat][]
  blockageReason?: string | null;
}

export class RoadFloodRiskService {
  private cachedRoads: RawRoad[] = [];

  constructor() {
    this.loadRoads();
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

  /**
   * Evaluates flood risk and accessibility state for all monitored road corridors
   * based on intersecting active flood zones and current hydrological scores
   */
  public evaluateRoadRisks(
    activeZones: GeographicRiskZone[] = [],
    cityFloodScore = 0
  ): RoadFloodRiskResult[] {
    if (this.cachedRoads.length === 0) {
      this.loadRoads();
    }

    return this.cachedRoads.map((road) => {
      // Check intersection with active risk zones
      let maxZoneRiskScore = 0;
      let intersectingZone: GeographicRiskZone | undefined;

      for (const zone of activeZones) {
        if (this.roadIntersectsZone(road.coordinates, zone.polygon)) {
          if (zone.floodScore > maxZoneRiskScore) {
            maxZoneRiskScore = zone.floodScore;
            intersectingZone = zone;
          }
        }
      }

      // Dynamic flood score for this segment:
      // If directly in zone, use zone score; otherwise blend segment baseline and city score
      const dynamicFloodScore = intersectingZone
        ? intersectingZone.floodScore
        : road.isHistoricallyFloodProne
        ? Math.max(road.floodScore, cityFloodScore * 0.8)
        : Math.max(road.floodScore, cityFloodScore * 0.4);

      // Evaluate composite risk and accessibility
      // Maintain strict separation between environmental flood score and operational accessibility
      const isPhysicallyBlocked = road.accessibilityState === 'BLOCKED' || (intersectingZone?.waterDepthCm ?? 0) >= 20;

      const evalResult = evaluateRoadSegmentRisk(
        {
          floodScore: dynamicFloodScore,
          trafficScore: road.trafficScore,
          isHistoricallyFloodProne: road.isHistoricallyFloodProne,
        },
        0, // Incident score
        isPhysicallyBlocked,
        intersectingZone?.waterDepthCm || 0
      );

      const riskState: FloodSeverity = classifyFloodSeverity(dynamicFloodScore);

      return {
        roadId: road.id,
        roadName: road.name,
        floodScore: dynamicFloodScore,
        riskState,
        accessibilityState: evalResult.accessibilityState,
        confidence: road.confidence,
        intersectingZoneId: intersectingZone?.zoneId,
        reason: evalResult.reason,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Spatial point/segment intersection with polygon
   */
  private roadIntersectsZone(roadCoords: [number, number][], polygon: [number, number][]): boolean {
    if (!roadCoords || !polygon || polygon.length < 3) return false;

    // Check if any road waypoint lies inside the polygon
    for (const pt of roadCoords) {
      if (this.pointInPolygon(pt, polygon)) {
        return true;
      }
    }

    // Also check centroid proximity as spatial buffer
    const roadCentroid = this.calculateCentroid(roadCoords);
    const polyCentroid = this.calculateCentroid(polygon);
    const dist = this.haversineDistance(roadCentroid[1], roadCentroid[0], polyCentroid[1], polyCentroid[0]);

    return dist <= 0.8; // 800-meter corridor intersection buffer
  }

  private pointInPolygon(point: [number, number], vs: [number, number][]): boolean {
    const x = point[0];
    const y = point[1];
    let inside = false;

    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0];
      const yi = vs[i][1];
      const xj = vs[j][0];
      const yj = vs[j][1];

      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  private calculateCentroid(coords: [number, number][]): [number, number] {
    let sumLon = 0;
    let sumLat = 0;
    const len = coords.length;
    for (const c of coords) {
      sumLon += c[0];
      sumLat += c[1];
    }
    return [sumLon / len, sumLat / len];
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const roadFloodRiskService = new RoadFloodRiskService();
