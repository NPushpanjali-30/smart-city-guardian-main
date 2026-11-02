import {
  FloodRiskFeatureSet,
  FloodPredictionResult,
  FloodSeverity,
  PredictionTrend,
} from '@smartcity/shared';
import { floodRiskConfig } from '../../config/floodRisk.config.js';
import { floodRiskEngine } from './floodRiskEngine.js';

export interface PredictorInputContext {
  features: FloodRiskFeatureSet;
  currentRiskScore: number;
  currentSeverity: FloodSeverity;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    zoneId?: string;
  };
  horizonMinutes?: number;
}

export class ShortHorizonPredictor {
  /**
   * Predicts flood hazard state over a 15–30 minute nowcast horizon
   */
  public predict(context: PredictorInputContext): FloodPredictionResult {
    const horizon = context.horizonMinutes || floodRiskConfig.prediction.defaultHorizonMinutes;
    const { features, currentRiskScore, currentSeverity, location } = context;

    // Rule 49: If essential telemetry is completely expired or unavailable, produce DEGRADED state
    if (features.dataFreshnessState === 'EXPIRED' || features.dataAgeMinutes > 120) {
      return {
        timestamp: new Date().toISOString(),
        location,
        riskScore: currentRiskScore,
        currentState: currentSeverity,
        predictedState: currentSeverity,
        predictionHorizonMinutes: horizon,
        probability: 0.0,
        confidence: 0.15,
        trend: 'STABLE',
        reasons: ['Flood prediction temporarily unavailable: telemetry data expired or unavailable'],
        modelVersion: floodRiskConfig.prediction.modelVersion,
        featureVersion: floodRiskConfig.prediction.featureVersion,
        fallbackLevel: 'DEGRADED',
      };
    }

    try {
      // Layer 2: Explainable Baseline Logistic Hazard Trajectory Model
      return this.predictBaselineModel(context, horizon);
    } catch {
      // Layer 3 Fallback: Deterministic Trend Engine
      return this.predictDeterministicTrendFallback(context, horizon);
    }
  }

  /**
   * Layer 2: Baseline Hazard Trajectory Model
   * Evaluates log-odds of escalation based on precipitation velocity, saturation, and radar forecast
   */
  private predictBaselineModel(context: PredictorInputContext, horizon: number): FloodPredictionResult {
    const { features, currentRiskScore, currentSeverity, location } = context;

    // Calibrated baseline model coefficients (standardized weights)
    // z = intercept + beta_rate * R + beta_accel * A + beta_forecast * F + beta_saturation * S + beta_hist * H
    const b0 = -2.8; // Baseline log-odds of immediate flash escalation
    const bRate = 0.045 * Math.min(100, features.rainfallRateMmh);
    const bAccel = 0.12 * Math.max(-10, Math.min(10, features.rainfallAcceleration));
    const bForecast = 0.025 * features.forecastIntensity;
    const bSat = 0.035 * Math.min(50, features.rainfall30mMm);
    const bHist = features.isHistoricallyFloodProne ? 0.65 : 0.0;
    const bReports = features.verifiedReportsCount > 0 ? 0.85 : 0.0;

    const z = b0 + bRate + bAccel + bForecast + bSat + bHist + bReports;
    // Logistic probability of crossing into elevated danger state
    const escalationProbability = Number((1 / (1 + Math.exp(-z))).toFixed(2));

    // Determine projected risk trajectory over horizon window
    let projectedScoreDelta = 0;
    let trend: PredictionTrend = 'STABLE';
    const reasons: string[] = [];

    if (features.rainfallTrend === 'INCREASING' || escalationProbability >= 0.65) {
      trend = 'INCREASING';
      // Projected score gain over horizon (up to +25 points for sustained downpours)
      projectedScoreDelta = Math.min(30, Number((escalationProbability * 25 * (horizon / 30)).toFixed(1)));
      reasons.push(`Precipitation accelerating at ${features.rainfallAcceleration.toFixed(1)} mm/h²`);
      if (features.forecastExpectedRainfallMm > 15) {
        reasons.push(`Radar projects sustained rainfall (${features.forecastExpectedRainfallMm.toFixed(1)} mm)`);
      }
      if (features.isHistoricallyFloodProne) {
        reasons.push('Low-lying basin accelerates surface water accumulation');
      }
    } else if (features.rainfallTrend === 'DECREASING' && features.rainfallRateMmh < 10) {
      trend = 'DECREASING';
      projectedScoreDelta = -Math.min(20, Number(((1 - escalationProbability) * 15 * (horizon / 30)).toFixed(1)));
      reasons.push('Rainfall rate diminishing; drainage capacity stabilizing corridor');
    } else {
      trend = 'STABLE';
      reasons.push('Hydrological conditions steady over nowcast window');
    }

    const projectedScore = Math.min(100, Math.max(0, Number((currentRiskScore + projectedScoreDelta).toFixed(1))));
    const predictedState = floodRiskEngine.evaluateSeverityWithHysteresis(projectedScore, currentSeverity);

    // Calculate prediction confidence
    let confidence = features.dataFreshnessState === 'LIVE' ? 0.88 : 0.72;
    if (features.dataAgeMinutes > 15) confidence -= 0.15;
    if (features.verifiedReportsCount > 0) confidence = Math.min(0.95, confidence + 0.05);

    return {
      timestamp: new Date().toISOString(),
      location,
      riskScore: projectedScore,
      currentState: currentSeverity,
      predictedState,
      predictionHorizonMinutes: horizon,
      probability: escalationProbability,
      confidence: Number(confidence.toFixed(2)),
      trend,
      reasons,
      modelVersion: floodRiskConfig.prediction.modelVersion,
      featureVersion: floodRiskConfig.prediction.featureVersion,
      fallbackLevel: 'BASELINE',
    };
  }

  /**
   * Layer 3 Fallback: Deterministic Trend Engine
   */
  private predictDeterministicTrendFallback(context: PredictorInputContext, horizon: number): FloodPredictionResult {
    const { features, currentRiskScore, currentSeverity, location } = context;

    let delta = 0;
    let trend: PredictionTrend = 'STABLE';
    if (features.rainfallTrend === 'INCREASING') {
      delta = 12;
      trend = 'INCREASING';
    } else if (features.rainfallTrend === 'DECREASING') {
      delta = -8;
      trend = 'DECREASING';
    }

    const projectedScore = Math.min(100, Math.max(0, currentRiskScore + delta));
    const predictedState = floodRiskEngine.evaluateSeverityWithHysteresis(projectedScore, currentSeverity);

    return {
      timestamp: new Date().toISOString(),
      location,
      riskScore: projectedScore,
      currentState: currentSeverity,
      predictedState,
      predictionHorizonMinutes: horizon,
      probability: trend === 'INCREASING' ? 0.60 : 0.25,
      confidence: 0.50, // Reduced confidence for fallback
      trend,
      reasons: ['Predictive estimate generated by deterministic trend fallback engine'],
      modelVersion: 'v1.0.0-deterministic-fallback',
      featureVersion: floodRiskConfig.prediction.featureVersion,
      fallbackLevel: 'DETERMINISTIC_TREND',
    };
  }
}

export const shortHorizonPredictor = new ShortHorizonPredictor();
