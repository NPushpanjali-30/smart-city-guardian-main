import {
  ExplainableTrafficScoreResult,
  FreshnessState,
  TrafficIncident,
  TrafficScoreFactorContribution,
  TrafficState,
} from '../types/index.js';

export interface TrafficCalculationInputs {
  speedKmh?: number;
  currentSpeedKmh?: number;
  freeFlowSpeedKmh?: number;
  delaySeconds?: number;
  currentTravelTimeSeconds?: number;
  freeFlowTravelTimeSeconds?: number;
  congestionLevel?: number; // 0 - 100
  incidents?: TrafficIncident[];
  dataAgeSeconds?: number;
  freshness?: FreshnessState;
  timestamp?: string;
}

export interface TrafficWeightConfiguration {
  speedWeight: number;      // default: 0.35
  delayWeight: number;      // default: 0.25
  congestionWeight: number; // default: 0.25
  incidentWeight: number;   // default: 0.15
}

export const DEFAULT_TRAFFIC_WEIGHTS: TrafficWeightConfiguration = {
  speedWeight: 0.35,
  delayWeight: 0.25,
  congestionWeight: 0.25,
  incidentWeight: 0.15,
};

/**
 * Calculates a fully explainable, transparent road-level traffic score and operational state.
 */
export function calculateTrafficScore(
  inputs: TrafficCalculationInputs,
  weights: TrafficWeightConfiguration = DEFAULT_TRAFFIC_WEIGHTS
): ExplainableTrafficScoreResult {
  const factors: TrafficScoreFactorContribution[] = [];

  // Safe speed evaluation (guarded against zero division and NaN)
  const freeFlow = inputs.freeFlowSpeedKmh && inputs.freeFlowSpeedKmh > 0 ? inputs.freeFlowSpeedKmh : 50;
  const currentSpeed = Math.max(0, inputs.currentSpeedKmh ?? inputs.speedKmh ?? 0);
  const speedRatio = Number((currentSpeed / freeFlow).toFixed(2));

  // 1. Speed Degradation Factor (0 - 100)
  // speedRatio >= 1.0 => 0 degradation; speedRatio near 0 => 100 degradation
  const speedDegradation = Math.min(100, Math.max(0, (1 - Math.min(1.0, speedRatio)) * 100));
  const speedContrib = Number((weights.speedWeight * speedDegradation).toFixed(1));
  factors.push({
    name: 'Speed Degradation',
    factor: 'speed_degradation',
    score: Number(speedDegradation.toFixed(1)),
    weight: weights.speedWeight,
    contribution: speedContrib,
    description: `Current speed ${currentSpeed.toFixed(1)} km/h vs free-flow ${freeFlow.toFixed(1)} km/h (ratio ${speedRatio})`,
  });

  // 2. Travel-Time Delay Factor (0 - 100)
  let baseTravelTime = 60;
  if (inputs.freeFlowTravelTimeSeconds && inputs.freeFlowTravelTimeSeconds > 0) {
    baseTravelTime = inputs.freeFlowTravelTimeSeconds;
  }
  let currentTravelTime = baseTravelTime;
  if (inputs.currentTravelTimeSeconds && inputs.currentTravelTimeSeconds > 0) {
    currentTravelTime = inputs.currentTravelTimeSeconds;
  } else if (inputs.delaySeconds !== undefined) {
    currentTravelTime = baseTravelTime + Math.max(0, inputs.delaySeconds);
  }

  const delayRatio = Number((currentTravelTime / baseTravelTime).toFixed(2));
  // delayRatio of 1.0 => 0 delay score; delayRatio >= 2.5 => 100 delay score
  const delayScore = Math.min(100, Math.max(0, ((Math.min(2.5, delayRatio) - 1.0) / 1.5) * 100));
  const delayContrib = Number((weights.delayWeight * delayScore).toFixed(1));
  factors.push({
    name: 'Travel-Time Delay',
    factor: 'delay_ratio',
    score: Number(delayScore.toFixed(1)),
    weight: weights.delayWeight,
    contribution: delayContrib,
    description: `Delay ratio is ${delayRatio}x (${currentTravelTime}s vs baseline ${baseTravelTime}s)`,
  });

  // 3. Congestion Telemetry Factor (0 - 100)
  const rawCongestion = Math.min(100, Math.max(0, inputs.congestionLevel ?? 20));
  const congestionContrib = Number((weights.congestionWeight * rawCongestion).toFixed(1));
  factors.push({
    name: 'Congestion Density',
    factor: 'congestion_density',
    score: Number(rawCongestion.toFixed(1)),
    weight: weights.congestionWeight,
    contribution: congestionContrib,
    description: `Direct provider congestion index measured at ${rawCongestion}/100`,
  });

  // 4. Traffic Incident Factor (0 - 100)
  const activeIncidents = inputs.incidents || [];
  let incidentScore = 0;
  let incidentDesc = 'No active incidents reported on this road corridor';

  if (activeIncidents.length > 0) {
    let maxSeverityScore = 0;
    let hasBlocking = false;

    for (const inc of activeIncidents) {
      if (inc.isBlocking || inc.type === 'CLOSURE') {
        hasBlocking = true;
      }
      let score = 25;
      const sev = (inc.severity || '').toUpperCase();
      if (sev === 'CRITICAL') score = 100;
      else if (sev === 'MAJOR' || sev === 'HIGH') score = 75;
      else if (sev === 'MODERATE' || sev === 'MEDIUM') score = 40;
      else if (sev === 'MINOR' || sev === 'LOW') score = 20;

      if (score > maxSeverityScore) maxSeverityScore = score;
    }

    incidentScore = hasBlocking ? 100 : maxSeverityScore;
    incidentDesc = `${activeIncidents.length} incident(s) active; highest severity rating is ${incidentScore}/100${
      hasBlocking ? ' (BLOCKING)' : ''
    }`;
  }

  const incidentContrib = Number((weights.incidentWeight * incidentScore).toFixed(1));
  factors.push({
    name: 'Incident Hazard',
    factor: 'incident_severity',
    score: Number(incidentScore.toFixed(1)),
    weight: weights.incidentWeight,
    contribution: incidentContrib,
    description: incidentDesc,
  });

  // 5. Data Freshness & Confidence Multiplier
  let ageSeconds = Math.max(0, inputs.dataAgeSeconds || 0);
  if (inputs.timestamp && !inputs.dataAgeSeconds) {
    const tsTime = new Date(inputs.timestamp).getTime();
    if (!isNaN(tsTime)) {
      ageSeconds = Math.max(0, Math.floor((Date.now() - tsTime) / 1000));
    }
  }
  const freshness = inputs.freshness || (ageSeconds > 3600 ? 'EXPIRED' : ageSeconds > 1800 ? 'STALE' : 'LIVE');
  let confidence = 1.0;

  if (freshness === 'EXPIRED' || ageSeconds > 1800) {
    confidence = 0.25;
  } else if (freshness === 'STALE' || ageSeconds > 600) {
    confidence = 0.60;
  } else if (freshness === 'RECENT') {
    confidence = 0.85;
  }

  // Composite raw weighted score
  const compositeScore = Number(
    Math.min(100, Math.max(0, speedContrib + delayContrib + congestionContrib + incidentContrib)).toFixed(1)
  );

  // Operational traffic state determination
  let state: TrafficState = 'SMOOTH';

  if (freshness === 'EXPIRED' && ageSeconds > 3600) {
    state = 'UNKNOWN';
  } else if (compositeScore >= 75 || incidentScore >= 90) {
    state = 'SEVERELY_CONGESTED';
  } else if (compositeScore >= 50) {
    state = 'CONGESTED';
  } else if (compositeScore >= 25 || speedRatio < 0.85) {
    state = 'SLOW';
  } else {
    state = 'SMOOTH';
  }

  const humanSummary = `Traffic score is ${compositeScore}/100 (${state}). Speed ratio is ${speedRatio}x with delay factor ${delayRatio}x. Confidence is ${(
    confidence * 100
  ).toFixed(0)}% (${freshness}).`;

  return {
    score: compositeScore,
    state,
    delayFactor: delayRatio,
    speedRatio,
    incidentRisk: incidentScore,
    confidence,
    factors,
    humanSummary,
    summary: humanSummary,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Classifies a raw score into a discrete TrafficState enum.
 */
export function classifyTrafficState(score: number, speedRatio = 1.0): TrafficState {
  if (score >= 75) return 'SEVERELY_CONGESTED';
  if (score >= 50) return 'CONGESTED';
  if (score >= 25 || speedRatio < 0.85) return 'SLOW';
  return 'SMOOTH';
}
