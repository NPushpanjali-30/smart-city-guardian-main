import {
  FloodSeverity,
  RoadAccessibility,
  TrafficCorridor,
  TrafficState,
} from '@smartcity/shared';
import { roadRiskService } from '../roads/roadRisk.service.js';

interface CorridorDefinition {
  id: string;
  name: string;
  description: string;
  roadIds: string[];
  suggestedAlternativeCorridor?: string;
}

const DEFAULT_CORRIDORS: CorridorDefinition[] = [
  {
    id: 'corridor-bay-expressway',
    name: 'Bay Street Waterfront Arterial',
    description: 'Low-elevation coastal corridor connecting Financial District and Harbor District',
    roadIds: ['road-bay-st-001'],
    suggestedAlternativeCorridor: 'corridor-highland-detour',
  },
  {
    id: 'corridor-highland-detour',
    name: 'Highland Avenue Elevated Ridge',
    description: 'High-elevation arterial corridor designated as primary flood evacuation bypass',
    roadIds: ['road-highland-ave-002'],
    suggestedAlternativeCorridor: 'corridor-market-central',
  },
  {
    id: 'corridor-market-central',
    name: 'Market Street Central Concourse',
    description: 'Mid-elevation commercial thoroughfare linking residential wards to central transit hub',
    roadIds: ['road-market-st-003'],
    suggestedAlternativeCorridor: 'corridor-highland-detour',
  },
];

export class TrafficCorridorService {
  /**
   * Evaluates all municipal corridors by aggregating member road segment states
   */
  public async getCorridors(): Promise<TrafficCorridor[]> {
    const roadRisks = await roadRiskService.getRoadRisks();
    const riskMap = new Map(roadRisks.map((r) => [r.roadId, r]));

    return DEFAULT_CORRIDORS.map((def) => {
      const memberRoads = def.roadIds.map((id) => riskMap.get(id)).filter(Boolean) as (typeof roadRisks)[0][];

      if (memberRoads.length === 0) {
        return {
          id: def.id,
          corridorId: def.id,
          name: def.name,
          description: def.description,
          roadIds: def.roadIds,
          averageCongestion: 0,
          trafficState: 'UNKNOWN',
          floodImpactSeverity: 'NORMAL',
          floodImpact: 'NORMAL',
          averageFloodScore: 0,
          accessibility: 'OPEN',
          estimatedDelaySeconds: 0,
          diversionRecommended: false,
          recommendedAction: 'MONITOR',
          alternativeCorridors: [],
        };
      }

      let congestionSum = 0;
      let floodScoreSum = 0;
      let delaySum = 0;
      let hasBlocked = false;
      let hasHighRisk = false;
      let hasCaution = false;

      for (const r of memberRoads) {
        congestionSum += r.traffic.score;
        floodScoreSum += r.flood.score;
        delaySum += Math.max(0, (r.traffic.delayRatio - 1.0) * 120);

        if (r.accessibility === 'BLOCKED') hasBlocked = true;
        else if (r.accessibility === 'HIGH_RISK') hasHighRisk = true;
        else if (r.accessibility === 'CAUTION') hasCaution = true;
      }

      const count = memberRoads.length;
      const avgCongestion = Number((congestionSum / count).toFixed(1));
      const avgFloodScore = Number((floodScoreSum / count).toFixed(1));

      let accessibility: RoadAccessibility = 'OPEN';
      if (hasBlocked) accessibility = 'BLOCKED';
      else if (hasHighRisk) accessibility = 'HIGH_RISK';
      else if (hasCaution) accessibility = 'CAUTION';

      let trafficState: TrafficState = 'SMOOTH';
      if (avgCongestion >= 75) trafficState = 'SEVERELY_CONGESTED';
      else if (avgCongestion >= 50) trafficState = 'CONGESTED';
      else if (avgCongestion >= 25) trafficState = 'SLOW';

      let floodImpactSeverity: FloodSeverity = 'NORMAL';
      if (avgFloodScore >= 75) floodImpactSeverity = 'CRITICAL';
      else if (avgFloodScore >= 50) floodImpactSeverity = 'WARNING';
      else if (avgFloodScore >= 25) floodImpactSeverity = 'WATCH';

      const diversionRecommended = accessibility === 'BLOCKED' || accessibility === 'HIGH_RISK' || avgCongestion >= 70;
      const recommendedAction = diversionRecommended ? 'DIVERT_TRAFFIC' : 'MONITOR';

      return {
        id: def.id,
        corridorId: def.id,
        name: def.name,
        description: def.description,
        roadIds: def.roadIds,
        averageCongestion: avgCongestion,
        trafficState,
        floodImpactSeverity,
        floodImpact: accessibility === 'BLOCKED' ? 'BLOCKED' : floodImpactSeverity,
        averageFloodScore: avgFloodScore,
        accessibility,
        estimatedDelaySeconds: Math.round(delaySum / count),
        diversionRecommended,
        recommendedAction,
        suggestedAlternativeCorridor: diversionRecommended ? def.suggestedAlternativeCorridor : undefined,
        alternativeCorridors: def.suggestedAlternativeCorridor ? [def.suggestedAlternativeCorridor] : [],
      };
    });
  }

  public async evaluateAllCorridors(): Promise<TrafficCorridor[]> {
    return this.getCorridors();
  }

  /**
   * Produces authority-level diversion and emergency corridor recommendations
   */
  public async getAuthorityAdvisories(): Promise<{
    hotspots: Array<{ corridorId: string; name: string; congestion: number; delaySeconds: number }>;
    floodImpactedCorridors: Array<{ corridorId: string; name: string; severity: FloodSeverity; accessibility: RoadAccessibility }>;
    diversionRecommendations: Array<{ fromCorridor: string; toCorridor?: string; reason: string }>;
    emergencyCorridors: Array<{ corridorId: string; name: string; status: string }>;
  }> {
    const corridors = await this.getCorridors();

    const hotspots = corridors
      .filter((c) => c.averageCongestion >= 50 || c.estimatedDelaySeconds >= 180)
      .map((c) => ({
        corridorId: c.id,
        name: c.name,
        congestion: c.averageCongestion,
        delaySeconds: c.estimatedDelaySeconds,
      }));

    const floodImpactedCorridors = corridors
      .filter((c) => c.floodImpactSeverity === 'WARNING' || c.floodImpactSeverity === 'CRITICAL' || c.accessibility === 'BLOCKED')
      .map((c) => ({
        corridorId: c.id,
        name: c.name,
        severity: c.floodImpactSeverity,
        accessibility: c.accessibility,
      }));

    const diversionRecommendations = corridors
      .filter((c) => c.diversionRecommended)
      .map((c) => ({
        fromCorridor: c.name,
        toCorridor: corridors.find((alt) => alt.id === c.suggestedAlternativeCorridor)?.name,
        reason: c.accessibility === 'BLOCKED'
          ? 'Physical flood blockage; traffic must be diverted immediately'
          : 'High flood exposure and heavy delay; precautionary diversion advised',
      }));

    const emergencyCorridors = [
      {
        corridorId: 'corridor-highland-ridge',
        name: 'Highland Avenue Elevated Ridge',
        status: 'PRESERVE_CLEAR_FOR_EMERGENCY_ACCESS',
      },
    ];

    return {
      hotspots,
      floodImpactedCorridors,
      diversionRecommendations,
      emergencyCorridors,
    };
  }
}

export const trafficCorridorService = new TrafficCorridorService();
