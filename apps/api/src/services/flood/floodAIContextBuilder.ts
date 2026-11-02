import {
  FloodAIContext,
  FloodPredictionResult,
  FloodRiskFeatureSet,
  GeographicRiskZone,
  RoadFloodRiskResult,
  ExplainableFloodRiskResult,
  FreshnessState,
} from '@smartcity/shared';

export interface AIContextBuildInputs {
  cityName?: string;
  coordinates?: [number, number];
  currentRisk: ExplainableFloodRiskResult;
  prediction: FloodPredictionResult;
  features: FloodRiskFeatureSet;
  affectedZones: GeographicRiskZone[];
  affectedRoads: RoadFloodRiskResult[];
  weatherSource?: string;
  floodSource?: string;
}

export class FloodAIContextBuilder {
  /**
   * Constructs an AI-ready, strongly-typed, fully traceable context envelope for Phase 4 Grok
   */
  public buildContext(inputs: AIContextBuildInputs): FloodAIContext {
    const timestamp = new Date().toISOString();
    const cityName = inputs.cityName || 'Metro Central';
    const coordinates = inputs.coordinates || [-74.006, 40.7128];

    const weatherSource = inputs.weatherSource || 'open-meteo-weather-adapter';
    const floodSource = inputs.floodSource || 'metro-flood-adapter';

    const dataFreshness: Record<string, { freshness: FreshnessState; ageMinutes: number; source: string }> = {
      weather: {
        freshness: inputs.features.dataFreshnessState,
        ageMinutes: inputs.features.dataAgeMinutes,
        source: weatherSource,
      },
      floodCatchment: {
        freshness: 'MOCK',
        ageMinutes: 2,
        source: floodSource,
      },
      roadNetwork: {
        freshness: 'LIVE',
        ageMinutes: 0,
        source: 'metro-road-network',
      },
    };

    // Traceability array: guarantees zero opaque blobs
    const traceability = [
      {
        field: 'currentRisk.score',
        source: 'FloodRiskEngine.calculateRisk',
        timestamp,
        method: 'Weighted multi-factor score (rainfall 35%, trend 15%, forecast 20%, hist 15%, reports 15%)',
      },
      {
        field: 'prediction.predictedState',
        source: 'ShortHorizonPredictor.predict',
        timestamp,
        method: `Baseline logistic trajectory nowcasting model (${inputs.prediction.modelVersion})`,
      },
      {
        field: 'features.rainfallAcceleration',
        source: 'FloodFeatureEngine.extractRainfallFeatures',
        timestamp,
        method: 'Finite difference rate of change (mm/h²)',
      },
      {
        field: 'affectedRoads',
        source: 'RoadFloodRiskService.evaluateRoadRisks',
        timestamp,
        method: 'Corridor-to-catchment polygon intersection & accessibility state classification',
      },
    ];

    return {
      timestamp,
      location: {
        cityName,
        coordinates,
      },
      currentRisk: {
        score: inputs.currentRisk.compositeScore,
        state: inputs.currentRisk.severity,
        reasons: inputs.currentRisk.factors.map((f) => f.description),
        confidence: inputs.currentRisk.confidence,
      },
      prediction: inputs.prediction,
      features: inputs.features,
      affectedZones: inputs.affectedZones,
      affectedRoads: inputs.affectedRoads,
      dataFreshness,
      traceability,
    };
  }
}

export const floodAIContextBuilder = new FloodAIContextBuilder();
