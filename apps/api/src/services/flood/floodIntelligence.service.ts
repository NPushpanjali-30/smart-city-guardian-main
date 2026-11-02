import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  WeatherObservation,
  WeatherForecast,
  FloodSeverity,
  GeographicRiskZone,
  RoadFloodRiskResult,
  ExplainableFloodRiskResult,
  FloodPredictionResult,
  FloodRiskFeatureSet,
  FloodAIContext,
  buildFloodRiskFeatureSet,
  DomainEventEnvelope,
} from '@smartcity/shared';
import { floodRiskEngine } from './floodRiskEngine.js';
import { shortHorizonPredictor } from './shortHorizonPredictor.js';
import { roadFloodRiskService } from './roadFloodRisk.service.js';
import { resolveMockPath } from '../../utils/mockPath.js';
import { floodAIContextBuilder } from './floodAIContextBuilder.js';
import { liveStateStore } from '../stateStore.js';
import { logger } from '../../utils/logger.js';

export interface FloodEvaluationResult {
  currentRisk: ExplainableFloodRiskResult;
  prediction: FloodPredictionResult;
  features: FloodRiskFeatureSet;
  zones: GeographicRiskZone[];
  affectedRoads: RoadFloodRiskResult[];
  aiContext: FloodAIContext;
  processingLatencyMs: number;
  evaluatedAt: string;
}

export class FloodIntelligenceService extends EventEmitter {
  private lastSeverity: FloodSeverity = 'NORMAL';
  private lastEvaluatedAt: string = new Date().toISOString();
  private predictionHistory: FloodPredictionResult[] = [];
  private lastEvaluationResult?: FloodEvaluationResult;

  constructor() {
    super();
  }

  /**
   * Evaluates overall flood intelligence, computes features, generates predictions,
   * updates road accessibility, handles hysteresis, and emits domain events.
   */
  public async evaluateRisk(params?: {
    weatherObservation?: WeatherObservation;
    weatherHistory?: WeatherObservation[];
    forecasts?: WeatherForecast[];
    isHistoricallyFloodProne?: boolean;
    reports?: Array<{ category: string; status: string; ageMinutes: number; distanceMeters: number }>;
  }): Promise<FloodEvaluationResult> {
    const startTime = Date.now();

    // 1. Resolve Weather Telemetry (from params or cached live store)
    let weather = params?.weatherObservation;
    if (!weather) {
      weather = liveStateStore.get<WeatherObservation>('weather:current:40.71:-74.01') || {
        id: 'weather-default',
        source: 'open-meteo',
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        location: { name: 'Metro Central', latitude: 40.7128, longitude: -74.006 },
        temperatureC: 21.5,
        humidityPercent: 92.0,
        rainfallRateMmh: 35.0,
        rainfall1hMm: 28.5,
        rainfall24hMm: 85.0,
        windSpeedKmh: 35.0,
        freshness: 'LIVE',
        dataAgeSeconds: 30,
      };
    }

    const weatherHistory = params?.weatherHistory || [];
    const forecasts = params?.forecasts || [];

    // 2. Load and classify Geographic Risk Zones (Observed vs Predicted vs Historical)
    const zones = this.loadAndClassifyZones(weather.rainfallRateMmh);

    // 3. Build Feature Set
    const features = buildFloodRiskFeatureSet({
      currentWeather: weather,
      weatherHistory,
      forecasts,
      isHistoricallyFloodProne: params?.isHistoricallyFloodProne ?? true,
      basinElevationM: 8.5,
      reports: params?.reports || [
        { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 10, distanceMeters: 300 },
      ],
      floodFreshness: 'MOCK',
      floodAgeMinutes: 5,
    });

    // 4. Calculate Current Risk with Hysteresis
    const currentRisk = floodRiskEngine.calculateRisk(features, this.lastSeverity);

    // 5. Generate Short-Horizon Prediction (15-30m)
    const prediction = shortHorizonPredictor.predict({
      features,
      currentRiskScore: currentRisk.compositeScore,
      currentSeverity: currentRisk.severity,
      location: {
        name: weather.location?.name || 'Metro Central',
        latitude: weather.location?.latitude || 40.7128,
        longitude: weather.location?.longitude || -74.006,
      },
    });

    // Store in historical prediction audit log (max 200 records)
    this.predictionHistory.unshift(prediction);
    if (this.predictionHistory.length > 200) this.predictionHistory.pop();

    // 6. Map Road Network Impacts
    const affectedRoads = roadFloodRiskService.evaluateRoadRisks(zones, currentRisk.compositeScore);

    // 7. Assemble Traceable Grok AI Context
    const aiContext = floodAIContextBuilder.buildContext({
      cityName: weather.location?.name,
      coordinates: [weather.location?.longitude || -74.006, weather.location?.latitude || 40.7128],
      currentRisk,
      prediction,
      features,
      affectedZones: zones,
      affectedRoads,
      weatherSource: weather.source,
    });

    const duration = Date.now() - startTime;
    const evaluatedAt = new Date().toISOString();

    const evaluationResult: FloodEvaluationResult = {
      currentRisk,
      prediction,
      features,
      zones,
      affectedRoads,
      aiContext,
      processingLatencyMs: duration,
      evaluatedAt,
    };

    this.lastEvaluationResult = evaluationResult;

    // 8. Cache Live State in Redis / LiveStateStore
    liveStateStore.set('flood:risk:current', evaluationResult, 180);
    liveStateStore.set('flood:prediction:current', prediction, 180);
    liveStateStore.set('flood:zones:current', zones, 180);
    liveStateStore.set('flood:roads:current', affectedRoads, 180);

    // 9. State Transition Detection & Event Dispatch
    const stateChanged = currentRisk.severity !== this.lastSeverity;
    this.lastSeverity = currentRisk.severity;
    this.lastEvaluatedAt = evaluatedAt;

    // Emit standard Domain Events
    this.emitDomainEvent('FLOOD_RISK_CHANGED', 'flood-intelligence-engine', {
      riskScore: currentRisk.compositeScore,
      severity: currentRisk.severity,
      prediction,
      latencyMs: duration,
    });

    if (stateChanged) {
      logger.info(`Flood State Transitioned: ${this.lastSeverity} -> ${currentRisk.severity}`);
      this.emitDomainEvent('FLOOD_RISK_CHANGED', 'flood-intelligence-engine', {
        transition: `${this.lastSeverity} -> ${currentRisk.severity}`,
        currentRisk,
        prediction,
      });
    }

    return evaluationResult;
  }

  /**
   * Loads catchment basins and applies explicit visual/data classification:
   * OBSERVED_CONFIRMED, PREDICTED_RISK, HISTORICAL_HOTSPOT
   */
  private loadAndClassifyZones(currentRainRate: number): GeographicRiskZone[] {
    const defaultZones: GeographicRiskZone[] = [
      {
        zoneId: 'zone-bay-basin-01',
        zoneName: 'Bay Basin Lowlands',
        zoneType: 'OBSERVED_CONFIRMED',
        severity: 'CRITICAL',
        floodScore: 86.4,
        confidence: 0.95,
        waterDepthCm: 28.0,
        drainageCapacityPercent: 15.0,
        isHistoricallyFloodProne: true,
        polygon: [
          [-74.015, 40.71],
          [-74.005, 40.71],
          [-74.005, 40.72],
          [-74.015, 40.72],
          [-74.015, 40.71],
        ],
        updatedAt: new Date().toISOString(),
      },
      {
        zoneId: 'zone-river-corridor-03',
        zoneName: 'East River Concourse',
        zoneType: 'PREDICTED_RISK',
        severity: currentRainRate > 25 ? 'WARNING' : 'WATCH',
        floodScore: currentRainRate > 25 ? 68.5 : 42.0,
        confidence: 0.82,
        waterDepthCm: 14.5,
        drainageCapacityPercent: 40.0,
        isHistoricallyFloodProne: true,
        polygon: [
          [-73.995, 40.715],
          [-73.985, 40.715],
          [-73.985, 40.725],
          [-73.995, 40.725],
          [-73.995, 40.715],
        ],
        updatedAt: new Date().toISOString(),
      },
      {
        zoneId: 'zone-highland-crest-02',
        zoneName: 'Highland Crest Ridge',
        zoneType: 'HISTORICAL_HOTSPOT',
        severity: 'NORMAL',
        floodScore: 12.0,
        confidence: 0.98,
        waterDepthCm: 0.0,
        drainageCapacityPercent: 95.0,
        isHistoricallyFloodProne: false,
        polygon: [
          [-74.025, 40.73],
          [-74.015, 40.73],
          [-74.015, 40.74],
          [-74.025, 40.74],
          [-74.025, 40.73],
        ],
        updatedAt: new Date().toISOString(),
      },
    ];

    try {
      const mockPath = resolveMockPath('mock/flood.json');
      if (fs.existsSync(mockPath)) {
        const parsed = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
        if (Array.isArray(parsed.zones) && parsed.zones.length > 0) {
          return parsed.zones.map((z: any, idx: number) => ({
            zoneId: z.zoneId || `zone-${idx}`,
            zoneName: z.zoneName || `Zone ${idx}`,
            zoneType: idx === 0 ? 'OBSERVED_CONFIRMED' : idx === 1 ? 'PREDICTED_RISK' : 'HISTORICAL_HOTSPOT',
            severity: z.severity || 'WATCH',
            floodScore: z.floodScore || 50,
            confidence: 0.90,
            waterDepthCm: z.waterDepthCm,
            drainageCapacityPercent: z.drainageCapacityPercent,
            isHistoricallyFloodProne: z.isHistoricallyFloodProne,
            polygon: z.polygon || [],
            updatedAt: new Date().toISOString(),
          }));
        }
      }
    } catch {
      // fallback to defaultZones
    }

    return defaultZones;
  }

  private emitDomainEvent(eventType: any, source: string, payload: any): void {
    const event: DomainEventEnvelope<any> = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      source,
      correlation_id: crypto.randomUUID(),
      payload,
    };
    this.emit('domain_event', event);
  }

  public getPredictionHistory(): FloodPredictionResult[] {
    return this.predictionHistory;
  }

  public getLastEvaluation(): FloodEvaluationResult | undefined {
    return this.lastEvaluationResult;
  }
}

export const floodIntelligenceService = new FloodIntelligenceService();
