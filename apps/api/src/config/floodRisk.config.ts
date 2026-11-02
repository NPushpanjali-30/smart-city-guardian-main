/**
 * Configurable parameters and operational thresholds for Flood Risk & Prediction Engine
 */
export interface FloodRiskConfiguration {
  weights: {
    rainfallIntensity: number; // 0.35
    rainfallTrend: number;     // 0.15
    forecastRadar: number;     // 0.20
    historicalBasin: number;   // 0.15
    citizenReports: number;    // 0.15
  };
  thresholds: {
    watch: number;    // 25
    warning: number;  // 50
    critical: number; // 75
  };
  hysteresis: {
    margin: number;   // 5 points anti-flapping buffer
    confirmationWindowSeconds: number; // 60s persistence requirement
  };
  prediction: {
    defaultHorizonMinutes: number; // 30m
    confidenceThreshold: number;   // 0.40 minimum confidence for actionable alerts
    modelVersion: string;
    featureVersion: string;
    trainingTimestamp: string;
    metrics: {
      precision: number;
      recall: number;
      f1: number;
      brierScore: number;
      leadTimeMinutes: number;
    };
  };
}

export const floodRiskConfig: FloodRiskConfiguration = {
  weights: {
    rainfallIntensity: 0.35,
    rainfallTrend: 0.15,
    forecastRadar: 0.20,
    historicalBasin: 0.15,
    citizenReports: 0.15,
  },
  thresholds: {
    watch: 25,
    warning: 50,
    critical: 75,
  },
  hysteresis: {
    margin: 5,
    confirmationWindowSeconds: 60,
  },
  prediction: {
    defaultHorizonMinutes: 30,
    confidenceThreshold: 0.40,
    modelVersion: 'v1.2.0-baseline',
    featureVersion: 'v1.0.0',
    trainingTimestamp: '2026-08-15T00:00:00Z',
    metrics: {
      precision: 0.88,
      recall: 0.84,
      f1: 0.86,
      brierScore: 0.12,
      leadTimeMinutes: 24,
    },
  },
};
