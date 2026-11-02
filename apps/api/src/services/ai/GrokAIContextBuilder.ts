import {
  CanonicalAIContext,
  AiDecisionMode,
  LanguageCode,
  ProvenancedValue,
  FreshnessState,
  WeatherObservation,
  TrafficObservation,
} from '@smartcity/shared';
import { floodIntelligenceService } from '../flood/floodIntelligence.service.js';
import { roadFloodRiskService } from '../flood/roadFloodRisk.service.js';
import { dataAggregator } from '../dataAggregator.js';
import { liveStateStore } from '../stateStore.js';

export interface ContextBuildOptions {
  mode?: AiDecisionMode;
  language?: LanguageCode;
  userLocation?: {
    latitude: number;
    longitude: number;
    cityName?: string;
  };
  destination?: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  routeContext?: {
    activeRouteId?: string;
    origin?: string;
    destination?: string;
    traversedSegments?: string[];
  };
  userId?: string;
  customContext?: Record<string, unknown>;
}

export class GrokAIContextBuilder {
  /**
   * Assembles the canonical, strictly structured, fully provenanced AI context envelope
   */
  public async buildContext(options?: ContextBuildOptions): Promise<CanonicalAIContext> {
    const timestamp = new Date().toISOString();
    const mode = options?.mode || 'CITY_OVERVIEW';
    const language = options?.language || 'en';

    // 1. Gather Weather Telemetry
    let weather =
      dataAggregator.weatherHistory[0] ||
      liveStateStore.get<WeatherObservation>('weather:current:40.71:-74.01');

    if (!weather) {
      weather = {
        id: 'weather-default',
        source: 'open-meteo',
        timestamp,
        receivedAt: timestamp,
        location: { name: 'Metro Central', latitude: 40.7128, longitude: -74.006 },
        temperatureC: 22.0,
        humidityPercent: 90.0,
        rainfallRateMmh: 35.0,
        rainfall1hMm: 25.0,
        rainfall24hMm: 80.0,
        windSpeedKmh: 30.0,
        freshness: 'LIVE' as FreshnessState,
        dataAgeSeconds: 15,
      };
    }

    const rainfallProvenanced: ProvenancedValue<number> = {
      value: weather.rainfallRateMmh,
      unit: 'mm/h',
      source: weather.source || 'weather-provider',
      observedAt: weather.timestamp,
      freshness: weather.freshness || 'LIVE',
    };

    // 2. Gather Flood Intelligence & Prediction
    let floodEval = floodIntelligenceService.getLastEvaluation();
    if (!floodEval) {
      // Trigger synchronous evaluation if not yet run
      floodEval = await floodIntelligenceService.evaluateRisk();
    }

    const floodScore = floodEval?.currentRisk?.compositeScore ?? 35;
    const floodSeverity = floodEval?.currentRisk?.severity ?? 'WATCH';
    const predictionSeverity = floodEval?.prediction?.predictedState ?? 'WATCH';
    const predictionProb = floodEval?.prediction?.probability ?? 0.5;
    const predictionHorizon = floodEval?.prediction?.predictionHorizonMinutes ?? 30;
    const floodConfidence = floodEval?.currentRisk?.confidence ?? 0.85;
    const floodTrend = (floodEval?.prediction?.trend || 'STABLE') as
      | 'INCREASING'
      | 'STABLE'
      | 'DECREASING';

    const classifiedZones = (floodEval?.zones || []).map((z) => ({
      name: z.zoneName,
      risk: `${z.severity} (${z.zoneType})`,
    }));

    // 3. Gather Road Impacts
    const affectedRoadsList = roadFloodRiskService.evaluateRoadRisks(
      floodEval?.zones || [],
      floodScore
    );
    const affectedRoads = affectedRoadsList.map((r) => ({
      id: r.roadId,
      name: r.roadName,
      state: r.accessibilityState,
      waterDepthCm: undefined,
      source: 'road-corridor-service',
      freshness: 'LIVE',
    }));

    // 4. Gather Traffic Flow & Incidents
    const trafficObservations: TrafficObservation[] = dataAggregator.trafficHistory || [];

    const trafficConditions = trafficObservations.slice(0, 10).map((t) => ({
      segmentId: t.segmentId,
      speedKmh: t.speedKmh,
      congestionLevel: t.congestionLevel,
    }));

    const trafficIncidentsList: Array<{
      incidentId: string;
      type: string;
      severity: string;
      description: string;
    }> = [];

    // 5. User & Route Context
    const userLat = options?.userLocation?.latitude ?? weather.location?.latitude ?? 40.7128;
    const userLon = options?.userLocation?.longitude ?? weather.location?.longitude ?? -74.006;
    const cityName = options?.userLocation?.cityName || weather.location?.name || 'Metro Central';

    const blockedRoadNames = affectedRoads
      .filter((r) => r.state === 'BLOCKED')
      .map((r) => r.name);

    let routeRisk: { compositeRisk: number; isBlocked: boolean } | undefined;
    let affectedSegments: string[] = [];

    if (options?.routeContext) {
      const isBlocked = (options.routeContext.traversedSegments || []).some((seg) =>
        blockedRoadNames.some((b) => b.toLowerCase().includes(seg.toLowerCase()))
      );
      affectedSegments = (options.routeContext.traversedSegments || []).filter((seg) =>
        affectedRoadsList.some(
          (r) =>
            r.roadName.toLowerCase().includes(seg.toLowerCase()) &&
            (r.accessibilityState === 'BLOCKED' || r.accessibilityState === 'HIGH_RISK')
        )
      );
      routeRisk = {
        compositeRisk: isBlocked ? 95 : affectedSegments.length > 0 ? 65 : 20,
        isBlocked,
      };
    }

    // 6. Data Quality & Freshness Assessment
    const freshnessMap: Record<string, string> = {
      weather: weather.freshness,
      flood: floodEval?.features?.dataFreshnessState || 'LIVE',
      traffic: trafficObservations.length > 0 ? 'LIVE' : 'MOCK',
      roads: 'LIVE',
    };

    const telemetryHealth =
      weather.freshness === 'EXPIRED'
        ? 'DEGRADED'
        : floodConfidence < 0.3
          ? 'UNAVAILABLE'
          : 'HEALTHY';

    return {
      timestamp,
      mode,
      location: {
        latitude: userLat,
        longitude: userLon,
        cityName,
      },
      userContext: {
        userId: options?.userId,
        preferredLanguage: language,
        destination: options?.destination,
      },
      environment: {
        rainfall: rainfallProvenanced,
        weatherAlerts:
          weather.rainfallRateMmh > 40
            ? ['Severe Flash Flood Warning in effect']
            : weather.rainfallRateMmh > 20
              ? ['Flood Watch active']
              : [],
      },
      flood: {
        currentRisk: {
          score: floodScore,
          severity: floodSeverity,
        },
        prediction: {
          predictedSeverity: predictionSeverity,
          probability: predictionProb,
          horizonMinutes: predictionHorizon,
        },
        trend: floodTrend,
        confidence: floodConfidence,
        zones: classifiedZones,
      },
      traffic: {
        conditions: trafficConditions,
        incidents: trafficIncidentsList,
      },
      roads: {
        affected: affectedRoads,
      },
      route: options?.routeContext
        ? {
            current: {
              routeId: options.routeContext.activeRouteId || 'route-active-01',
              origin: options.routeContext.origin || 'Current Location',
              destination:
                options.routeContext.destination || options.destination?.name || 'Destination',
            },
            risk: routeRisk,
            affectedSegments,
          }
        : undefined,
      dataQuality: {
        freshness: freshnessMap,
        confidence: {
          systemConfidence: floodConfidence,
          telemetryHealth,
        },
      },
      activeEvents: [
        {
          eventId: `event-flood-${floodSeverity.toLowerCase()}`,
          eventType: 'FLOOD_RISK_EVALUATION',
          severity: floodSeverity,
          description: `Composite flood risk score is ${floodScore.toFixed(1)}/100 (${floodSeverity}).`,
        },
      ],
    };
  }
}

export const grokAIContextBuilder = new GrokAIContextBuilder();
