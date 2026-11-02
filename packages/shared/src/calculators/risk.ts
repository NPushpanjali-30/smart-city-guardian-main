import {
  ExplainableFloodRiskResult,
  FloodSeverity,
  RiskFactorContribution,
  RoadAccessibility,
  RoadSegment,
} from '../types/index.js';

export interface FloodRiskInputs {
  rainfallRateMmh: number;
  rainfall1hMm: number;
  rainfall24hMm: number;
  forecastExpectedRainfallMm?: number;
  forecastPrecipitationProbability?: number;
  isHistoricallyFloodProne?: boolean;
  verifiedCitizenReportsCount?: number;
  dataAgeMinutes?: number;
}

/**
 * Calculates a fully explainable, transparent multi-factor flood risk score.
 */
export function calculateFloodRisk(inputs: FloodRiskInputs): ExplainableFloodRiskResult {
  const factors: RiskFactorContribution[] = [];

  // 1. Rainfall Intensity Score (0 - 100)
  const currentRain = Math.max(0, inputs.rainfallRateMmh);
  const rainScore = Math.min(100, (currentRain / 50) * 100);
  const rainContrib = 0.35 * rainScore;
  factors.push({
    name: 'Current Rainfall Intensity',
    contribution: Number(rainContrib.toFixed(1)),
    description: `Current rate of ${currentRain.toFixed(1)} mm/h yields intensity score of ${rainScore.toFixed(1)}/100`,
  });

  // 2. Antecedent Precipitation (Soil Saturation) Score (0 - 100)
  const rain1h = Math.max(0, inputs.rainfall1hMm);
  const rain24h = Math.max(0, inputs.rainfall24hMm);
  const antecedentScore = Math.min(100, (rain1h / 30) * 50 + (rain24h / 100) * 50);
  const antecedentContrib = 0.25 * antecedentScore;
  factors.push({
    name: 'Soil Saturation & Antecedent Rain',
    contribution: Number(antecedentContrib.toFixed(1)),
    description: `Accumulated ${rain1h.toFixed(1)}mm (1h) and ${rain24h.toFixed(1)}mm (24h) yields saturation score of ${antecedentScore.toFixed(1)}/100`,
  });

  // 3. Short-Term Forecast Score (0 - 100)
  const expectedRain = Math.max(0, inputs.forecastExpectedRainfallMm ?? 0);
  const prob = Math.min(1.0, Math.max(0, inputs.forecastPrecipitationProbability ?? 0.5));
  const forecastScore = Math.min(100, prob * (expectedRain / 40) * 100);
  const forecastContrib = 0.20 * forecastScore;
  factors.push({
    name: 'Predictive Radar Forecast',
    contribution: Number(forecastContrib.toFixed(1)),
    description: `Expected ${expectedRain.toFixed(1)}mm (prob ${(prob * 100).toFixed(0)}%) yields forecast score of ${forecastScore.toFixed(1)}/100`,
  });

  // 4. Physical Evidence & Historical Vulnerability (0 - 100)
  const histPoints = inputs.isHistoricallyFloodProne ? 60 : 0;
  const reportPoints = Math.min(40, (inputs.verifiedCitizenReportsCount ?? 0) * 20);
  const evidenceScore = Math.min(100, histPoints + reportPoints);
  const evidenceContrib = 0.20 * evidenceScore;
  factors.push({
    name: 'Physical & Catchment Evidence',
    contribution: Number(evidenceContrib.toFixed(1)),
    description: `Catchment vulnerability (${histPoints} pts) and ${inputs.verifiedCitizenReportsCount ?? 0} verified reports (${reportPoints} pts)`,
  });

  // 5. Data Freshness & Confidence Multiplier (0.2 - 1.0)
  const ageMinutes = Math.max(0, inputs.dataAgeMinutes ?? 0);
  let confidence = 1.0;
  if (ageMinutes > 60) {
    confidence = 0.4;
  } else if (ageMinutes > 20) {
    confidence = 0.75;
  }

  // Raw weighted score before confidence scaling
  const rawScore = rainContrib + antecedentContrib + forecastContrib + evidenceContrib;
  const compositeScore = Math.min(100, Math.max(0, Number((rawScore * confidence).toFixed(1))));

  // Classify severity level
  const severity = classifyFloodSeverity(compositeScore);

  const humanSummary = `Composite Flood Risk is ${compositeScore}/100 (${severity}). Driven by ${
    currentRain > 25 ? 'intense downpour' : 'moderate rain'
  }${inputs.isHistoricallyFloodProne ? ' in a designated flood-prone basin' : ''}. Confidence is ${(confidence * 100).toFixed(0)}%.`;

  return {
    compositeScore,
    severity,
    confidence,
    factors,
    humanSummary,
  };
}

/**
 * Classifies score into discrete operational severity level.
 */
export function classifyFloodSeverity(score: number): FloodSeverity {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'WARNING';
  if (score >= 25) return 'WATCH';
  return 'NORMAL';
}

/**
 * Evaluates dynamic risk and accessibility state for an individual road segment.
 */
export function evaluateRoadSegmentRisk(
  segment: Pick<RoadSegment, 'floodScore' | 'trafficScore' | 'isHistoricallyFloodProne'>,
  incidentScore = 0,
  isHardBlocked = false,
  waterDepthCm = 0
): { compositeRisk: number; accessibilityState: RoadAccessibility; reason: string } {
  if (isHardBlocked || waterDepthCm >= 20) {
    return {
      compositeRisk: 100.0,
      accessibilityState: 'BLOCKED',
      reason: waterDepthCm >= 20 
        ? `Road submerged: water depth is ${waterDepthCm}cm exceeding safe threshold (15cm)`
        : 'Road officially closed or impassable',
    };
  }

  const floodWeight = 0.60;
  const trafficWeight = 0.25;
  const incidentWeight = 0.15;

  const compositeRisk = Number(
    Math.min(100, floodWeight * segment.floodScore + trafficWeight * segment.trafficScore + incidentWeight * incidentScore).toFixed(1)
  );

  let accessibilityState: RoadAccessibility = 'OPEN';
  let reason = 'Road is fully accessible under normal safety parameters';

  if (compositeRisk >= 75 || segment.floodScore >= 80) {
    accessibilityState = 'HIGH_RISK';
    reason = 'Hazardous water accumulation; extreme caution or detour advised';
  } else if (compositeRisk >= 50 || segment.floodScore >= 50) {
    accessibilityState = 'CAUTION';
    reason = 'Minor water pooling or heavy congestion; reduce transit speed';
  }

  return {
    compositeRisk,
    accessibilityState,
    reason,
  };
}
