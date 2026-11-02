import {
  CalculatedRouteResult,
  CandidateRouteOutput,
  RoadAccessibility,
  RoadSegment,
  RouteReasoning,
  RouteStatus,
  RoutingParameters,
  SegmentCostResult,
} from '../types/index.js';

export const DEFAULT_ROUTING_PARAMS: RoutingParameters = {
  alphaTimeWeight: 1.0,
  betaTrafficWeight: 1.5,
  gammaFloodWeight: 3.0,
  deltaIncidentWeight: 1.0,
};

/**
 * Calculates safety-weighted cost for an individual road segment.
 */
export function calculateSegmentCost(
  segment: RoadSegment,
  params: RoutingParameters = DEFAULT_ROUTING_PARAMS
): SegmentCostResult {
  // STRICT EXCLUSION: If segment is blocked, cost is infinite and segment cannot be routed
  if (segment.accessibilityState === 'BLOCKED') {
    return {
      segmentId: segment.id,
      isExcluded: true,
      exclusionReason: segment.blockageReason || 'Road segment is impassable/blocked',
      travelTimeSeconds: Infinity,
      trafficPenaltySeconds: Infinity,
      floodPenaltySeconds: Infinity,
      incidentPenaltySeconds: Infinity,
      totalCost: Infinity,
    };
  }

  // Base travel time in seconds: length / speed (m/s)
  const speedLimitMs = Math.max(5, (segment.speedLimitKmh * 1000) / 3600);
  const baseTravelTimeSeconds = segment.lengthMeters / speedLimitMs;

  // Traffic congestion penalty (scaled by congestion score 0-100)
  const congestionRatio = segment.trafficScore / 100;
  const trafficPenalty = baseTravelTimeSeconds * congestionRatio * params.betaTrafficWeight;

  // Flood penalty: Non-linear escalation based on floodScore and accessibilityState
  let floodMultiplier = 0;
  if (segment.accessibilityState === 'HIGH_RISK') {
    floodMultiplier = 10.0; // Severe deterrent
  } else if (segment.accessibilityState === 'CAUTION') {
    floodMultiplier = 2.0;
  } else if (segment.accessibilityState === 'UNKNOWN') {
    floodMultiplier = 3.0; // Conservative safety bias
  }

  const floodPenalty = (segment.floodScore / 100) * params.gammaFloodWeight * 60 * (1 + floodMultiplier);

  // Non-blocking incident penalty
  const incidentPenalty = 0; // Baseline for phase 1

  const totalCost = Number(
    (params.alphaTimeWeight * baseTravelTimeSeconds + trafficPenalty + floodPenalty + incidentPenalty).toFixed(1)
  );

  return {
    segmentId: segment.id,
    isExcluded: false,
    travelTimeSeconds: Number(baseTravelTimeSeconds.toFixed(1)),
    trafficPenaltySeconds: Number(trafficPenalty.toFixed(1)),
    floodPenaltySeconds: Number(floodPenalty.toFixed(1)),
    incidentPenaltySeconds: incidentPenalty,
    totalCost,
  };
}

/**
 * Evaluates candidate path consisting of consecutive road segments.
 */
export function evaluateCandidateRoute(
  segments: RoadSegment[],
  params: RoutingParameters = DEFAULT_ROUTING_PARAMS
): CalculatedRouteResult {
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  let totalCost = 0;
  let weightedRiskSum = 0;
  let isBlocked = false;

  const segmentResults: SegmentCostResult[] = [];

  for (const seg of segments) {
    totalDistanceMeters += seg.lengthMeters;
    const costRes = calculateSegmentCost(seg, params);
    segmentResults.push(costRes);

    if (costRes.isExcluded) {
      isBlocked = true;
      totalCost = Infinity;
    } else {
      totalDurationSeconds += costRes.travelTimeSeconds + (costRes.trafficPenaltySeconds / params.betaTrafficWeight);
      if (!isBlocked) {
        totalCost += costRes.totalCost;
      }
      weightedRiskSum += seg.compositeRisk * seg.lengthMeters;
    }
  }

  const totalRiskScore = totalDistanceMeters > 0 
    ? Number((weightedRiskSum / totalDistanceMeters).toFixed(1)) 
    : 0;

  return {
    totalDistanceMeters,
    totalDurationSeconds: Math.round(totalDurationSeconds),
    totalCost: isBlocked ? Infinity : Number(totalCost.toFixed(1)),
    totalRiskScore,
    isBlocked,
    segments: segmentResults,
  };
}

/**
 * Phase 5 Research-Aligned Metric: Flood Route Index (FRI)
 * Inspired by Smart FAS research: distance-weighted flood exposure across path segments.
 */
export function calculateFloodRouteIndex(
  segments: Array<RoadSegment | { floodPenalty?: number; lengthMeters: number; floodScore?: number; accessibilityState?: RoadAccessibility }>
): number {
  let sum = 0;
  let totalDist = 0;

  for (const seg of segments) {
    totalDist += seg.lengthMeters;
    if ('floodPenalty' in seg && seg.floodPenalty !== undefined) {
      sum += seg.floodPenalty * seg.lengthMeters;
    } else {
      let multiplier = 1.0;
      if (seg.accessibilityState === 'BLOCKED') multiplier = 100.0;
      else if (seg.accessibilityState === 'HIGH_RISK') multiplier = 10.0;
      else if (seg.accessibilityState === 'CAUTION') multiplier = 2.0;

      sum += ((seg.floodScore || 0) / 100) * multiplier * seg.lengthMeters;
    }
  }

  if (totalDist <= 0) return 0;
  return Number((sum / totalDist).toFixed(3));
}

/**
 * Phase 5 Research-Aligned Metric: Mobility Risk Index (MRI)
 * MRI = weighted average of composite road risk by segment distance
 * OR composite score combining flood, traffic and incident risks
 */
export function calculateMobilityRiskIndex(
  input: RoadSegment[] | { floodRisk: number; trafficRisk: number; incidentRisk: number }
): number {
  if (Array.isArray(input)) {
    let totalDistance = 0;
    let weightedRisk = 0;

    for (const seg of input) {
      totalDistance += seg.lengthMeters;
      weightedRisk += seg.compositeRisk * seg.lengthMeters;
    }

    if (totalDistance <= 0) return 0;
    return Number((weightedRisk / totalDistance).toFixed(1));
  } else {
    const floodWeight = 0.55;
    const trafficWeight = 0.30;
    const incidentWeight = 0.15;
    const result = floodWeight * input.floodRisk + trafficWeight * input.trafficRisk + incidentWeight * input.incidentRisk;
    return Math.round(result);
  }
}

/**
 * Classifies the operational RouteStatus based on road accessibility and risk
 */
export function classifyRouteStatus(
  arg1: RoadSegment[] | number,
  arg2?: number | boolean,
  arg3?: boolean
): RouteStatus {
  if (typeof arg1 === 'number') {
    const score = arg1;
    const isBlocked = Boolean(arg2);
    if (isBlocked) return 'INVALID';
    if (score >= 60) return 'HIGH_RISK';
    if (score >= 25) return 'CAUTION';
    return 'SAFE_TO_PROCEED';
  } else {
    const segments = arg1;
    const totalRiskScore = typeof arg2 === 'number' ? arg2 : 0;
    const isBlocked = Boolean(arg3);
    if (isBlocked) return 'INVALID';
    if (segments.some((s) => s.accessibilityState === 'BLOCKED')) return 'INVALID';
    if (segments.some((s) => s.accessibilityState === 'HIGH_RISK') || totalRiskScore >= 60) return 'HIGH_RISK';
    if (segments.some((s) => s.accessibilityState === 'CAUTION') || totalRiskScore >= 25) return 'CAUTION';
    if (segments.some((s) => s.accessibilityState === 'UNKNOWN')) return 'UNKNOWN';
    return 'SAFE_TO_PROCEED';
  }
}

/**
 * Generates transparent, human-explainable reasoning for why this route was ranked/selected
 */
export function buildRouteReasoning(
  route: any,
  allCandidates: any[] = []
): RouteReasoning {
  const advantages: string[] = [];
  const cautions: string[] = [];
  const tradeOffs: string[] = [];

  const floodScore = route.risk?.flood ?? route.floodRisk ?? 0;
  const trafficScore = route.risk?.traffic ?? route.trafficRisk ?? 0;
  const isBlocked = Boolean(route.isBlocked);
  const durationSec = route.estimatedTravelTimeSeconds ?? route.durationSeconds ?? 0;
  const baselineSec = route.baselineDurationSeconds ?? (allCandidates.length > 0 ? Math.min(...allCandidates.map((c) => c.estimatedTravelTimeSeconds ?? c.durationSeconds ?? Infinity)) : durationSec);

  if (isBlocked) {
    cautions.push('Route contains impassable or submerged corridor segments.');
    return {
      summary: 'Route is INVALID and cannot be navigated safely.',
      advantages: [],
      cautions,
      tradeOffs: ['Do not attempt transit along this corridor.'],
    };
  }

  // Advantages
  if (floodScore < 25) {
    advantages.push('Minimal flood hazard exposure along elevated topography');
  } else if (floodScore < 50) {
    cautions.push('Minor water accumulation reported along peripheral links');
  } else {
    cautions.push('Elevated water pooling on route corridor; caution required');
  }

  if (trafficScore < 30) {
    advantages.push('Smooth traffic flow with low delay factor');
  } else if (trafficScore >= 60) {
    cautions.push('Heavy congestion with significant transit delay');
  }

  if (durationSec > baselineSec) {
    const diffMin = Math.round((durationSec - baselineSec) / 60);
    if (diffMin > 0) {
      tradeOffs.push(`+${diffMin} min additional travel time to prioritize personal safety`);
    }
  }

  const summary = route.routeType === 'RECOMMENDED'
    ? 'Recommended based on current flood risk, road accessibility, and traffic conditions.'
    : 'Alternative candidate route evaluated for safety and transit viability.';

  return {
    summary,
    advantages,
    cautions,
    tradeOffs,
  };
}
