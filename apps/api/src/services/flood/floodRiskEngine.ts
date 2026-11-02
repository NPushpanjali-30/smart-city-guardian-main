import {
  FloodRiskFeatureSet,
  FloodSeverity,
  ExplainableFloodRiskResult,
  RiskFactorContribution,
} from '@smartcity/shared';
import { floodRiskConfig } from '../../config/floodRisk.config.js';

export class FloodRiskEngine {
  /**
   * Calculates explainable flood risk score from engineered features
   */
  public calculateRisk(
    features: FloodRiskFeatureSet,
    previousState?: FloodSeverity
  ): ExplainableFloodRiskResult {
    const factors: RiskFactorContribution[] = [];
    const w = floodRiskConfig.weights;

    // 1. Rainfall Intensity Score [0, 100]
    // Calibrated against flash flood benchmark (50 mm/h downpour = 100)
    const rainScore = Math.min(100, (features.rainfallRateMmh / 50) * 100);
    const rainContrib = w.rainfallIntensity * rainScore;
    factors.push({
      name: 'Rainfall Intensity',
      contribution: Number(rainContrib.toFixed(1)),
      description: `Precipitation rate of ${features.rainfallRateMmh.toFixed(1)} mm/h yields intensity score of ${rainScore.toFixed(1)}/100`,
    });

    // 2. Rainfall Trend & Acceleration Score [0, 100]
    let trendScore = 50; // neutral stable baseline
    if (features.rainfallTrend === 'INCREASING') {
      trendScore = Math.min(100, 70 + Math.max(0, features.rainfallAcceleration) * 3);
    } else if (features.rainfallTrend === 'DECREASING') {
      trendScore = Math.max(10, 30 + Math.min(0, features.rainfallAcceleration) * 2);
    }
    // Also factor 30m / 1h accumulation into trend exhaustion
    const accumulationBonus = Math.min(25, (features.rainfall30mMm / 20) * 25);
    trendScore = Math.min(100, trendScore + accumulationBonus);
    const trendContrib = w.rainfallTrend * trendScore;
    factors.push({
      name: 'Rainfall Trend & Dynamic Acceleration',
      contribution: Number(trendContrib.toFixed(1)),
      description: `Trend is ${features.rainfallTrend} (accel: ${features.rainfallAcceleration.toFixed(1)} mm/h², 30m accum: ${features.rainfall30mMm.toFixed(1)} mm)`,
    });

    // 3. Short-Term Forecast Radar Score [0, 100]
    const forecastScore = Math.min(100, features.forecastIntensity);
    const forecastContrib = w.forecastRadar * forecastScore;
    factors.push({
      name: 'Predictive Radar Forecast',
      contribution: Number(forecastContrib.toFixed(1)),
      description: `Expected ${features.forecastExpectedRainfallMm.toFixed(1)} mm (prob ${(features.forecastPrecipitationProbability * 100).toFixed(0)}%) yields radar score of ${forecastScore.toFixed(1)}/100`,
    });

    // 4. Historical Catchment Vulnerability [0, 100]
    const histScore = features.basinDepressionScore;
    const histContrib = w.historicalBasin * histScore;
    factors.push({
      name: 'Historical & Topographical Vulnerability',
      contribution: Number(histContrib.toFixed(1)),
      description: `${features.isHistoricallyFloodProne ? 'Designated historical flood basin' : 'Standard drainage sector'} (depression score: ${histScore}/100)`,
    });

    // 5. Crowdsourced & Corroborating Evidence [0, 100]
    const crowdsourcedScore = features.reportSpatialClusterWeight;
    const crowdsourcedContrib = w.citizenReports * crowdsourcedScore;
    factors.push({
      name: 'On-Ground Hazard Reports',
      contribution: Number(crowdsourcedContrib.toFixed(1)),
      description: `${features.verifiedReportsCount} verified and ${features.unverifiedReportsCount} unverified reports (cluster weight: ${crowdsourcedScore}/100)`,
    });

    // Raw weighted score
    const rawScore = rainContrib + trendContrib + forecastContrib + histContrib + crowdsourcedContrib;

    // Confidence multiplier
    // Freshness & missing variable penalties scale the score appropriately
    let confidenceMultiplier = 1.0;
    if (features.dataAgeMinutes > 60 || features.dataFreshnessState === 'EXPIRED') {
      confidenceMultiplier = 0.50;
    } else if (features.dataAgeMinutes > 20 || features.dataFreshnessState === 'STALE') {
      confidenceMultiplier = 0.75;
    } else if (features.dataFreshnessState === 'RECENT') {
      confidenceMultiplier = 0.90;
    }

    // Corroboration bonus
    if (features.corroborationFactor > 0.8) {
      confidenceMultiplier = Math.min(1.0, confidenceMultiplier + 0.05);
    }

    const compositeScore = Math.min(100, Math.max(0, Number((rawScore * confidenceMultiplier).toFixed(1))));

    // Operational state classification with Hysteresis
    const severity = this.evaluateSeverityWithHysteresis(compositeScore, previousState);

    // Human-readable summary
    const summaryParts: string[] = [];
    if (features.rainfallRateMmh > 30) summaryParts.push(`violent downpour (${features.rainfallRateMmh.toFixed(1)} mm/h)`);
    else if (features.rainfallRateMmh > 10) summaryParts.push(`moderate precipitation (${features.rainfallRateMmh.toFixed(1)} mm/h)`);
    if (features.rainfallTrend === 'INCREASING') summaryParts.push('accelerating intensity');
    if (features.isHistoricallyFloodProne) summaryParts.push('low-elevation catchment basin');
    if (features.verifiedReportsCount > 0) summaryParts.push(`${features.verifiedReportsCount} verified citizen hazard reports`);

    const humanSummary = `Composite Flood Risk is ${compositeScore}/100 (${severity}). Condition driven by ${
      summaryParts.length > 0 ? summaryParts.join(', ') : 'normal environmental baseline'
    }. Confidence is ${(confidenceMultiplier * 100).toFixed(0)}%.`;

    return {
      compositeScore,
      severity,
      confidence: Number(confidenceMultiplier.toFixed(2)),
      factors,
      humanSummary,
    };
  }

  /**
   * Applies hysteresis thresholds to prevent rapid state flapping
   */
  public evaluateSeverityWithHysteresis(
    score: number,
    previousState?: FloodSeverity
  ): FloodSeverity {
    const { thresholds, hysteresis } = floodRiskConfig;
    const margin = hysteresis.margin;

    if (previousState === 'CRITICAL') {
      // Leave CRITICAL only if score drops below critical - margin (e.g. < 70)
      if (score >= thresholds.critical - margin) return 'CRITICAL';
      if (score >= thresholds.warning - margin) return 'WARNING';
      if (score >= thresholds.watch - margin) return 'WATCH';
      return 'NORMAL';
    }

    if (previousState === 'WARNING') {
      if (score >= thresholds.critical) return 'CRITICAL';
      // Leave WARNING only if score drops below warning - margin (e.g. < 45)
      if (score >= thresholds.warning - margin) return 'WARNING';
      if (score >= thresholds.watch - margin) return 'WATCH';
      return 'NORMAL';
    }

    if (previousState === 'WATCH') {
      if (score >= thresholds.critical) return 'CRITICAL';
      if (score >= thresholds.warning) return 'WARNING';
      // Leave WATCH only if score drops below watch - margin (e.g. < 20)
      if (score >= thresholds.watch - margin) return 'WATCH';
      return 'NORMAL';
    }

    // Default entry transitions without prior state
    if (score >= thresholds.critical) return 'CRITICAL';
    if (score >= thresholds.warning) return 'WARNING';
    if (score >= thresholds.watch) return 'WATCH';
    return 'NORMAL';
  }
}

export const floodRiskEngine = new FloodRiskEngine();
