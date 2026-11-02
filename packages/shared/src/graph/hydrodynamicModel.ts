/**
 * Hydrodynamic Traffic Flow & Kinematic Wave Modeling (Lighthill-Whitham-Richards Theory)
 *
 * Models traffic as a compressible fluid governed by the continuity equation:
 *   ∂k/∂t + ∂q/∂x = 0
 * Where:
 *   k = traffic density (vehicles / km)
 *   q = flow rate (vehicles / hour) = k * v(k)
 *   w = shockwave speed = Δq / Δk
 */

export interface HydrodynamicLinkState {
  lengthMeters: number;
  lanes: number;
  freeFlowSpeedKmh: number;
  jamDensityPerKmPerLane: number; // default: ~130 veh/km/lane
  currentDensityPerKm: number;
  floodDepthCm: number;
  criticalFloodDepthCm: number; // default: 28cm
  floodRiseRateCmPerHour: number;
}

export interface ShockwaveAnalysis {
  upstreamDensity: number;
  downstreamDensity: number;
  upstreamFlow: number;
  downstreamFlow: number;
  shockwaveVelocityKmh: number;
  isBackwardPropagating: boolean; // True if bottleneck propagates upstream toward approaching traffic
  estimatedArrivalTimeAtDistanceSeconds: (distanceMeters: number) => number;
}

export interface FloodClearanceAssessment {
  currentDepthCm: number;
  criticalDepthCm: number;
  remainingFreeboardCm: number;
  timeToSubmergeSeconds: number;
  isCurrentlySubmerged: boolean;
  isPreemptivelyUnsafe: boolean; // Will submerge before commuter can clear the segment
}

/**
 * Calculates velocity from density using Greenshields macroscopic fundamental diagram:
 * v(k) = v_f * (1 - k / k_jam)
 */
export function calculateKinematicSpeed(
  densityPerKmPerLane: number,
  freeFlowSpeedKmh: number,
  jamDensityPerKmPerLane = 135
): number {
  if (densityPerKmPerLane <= 0) return freeFlowSpeedKmh;
  if (densityPerKmPerLane >= jamDensityPerKmPerLane) return 5.0; // Creep speed floor

  const ratio = Math.min(1.0, densityPerKmPerLane / jamDensityPerKmPerLane);
  const speed = freeFlowSpeedKmh * (1 - ratio);
  return Math.max(5.0, speed);
}

/**
 * Calculates traffic flow rate q = k * v(k) (vehicles per hour per lane).
 */
export function calculateKinematicFlow(
  densityPerKmPerLane: number,
  freeFlowSpeedKmh: number,
  jamDensityPerKmPerLane = 135
): number {
  const speed = calculateKinematicSpeed(densityPerKmPerLane, freeFlowSpeedKmh, jamDensityPerKmPerLane);
  return densityPerKmPerLane * speed;
}

/**
 * Analyzes traffic shockwave between an upstream normal regime and downstream bottleneck.
 * Velocity w = (q2 - q1) / (k2 - k1)
 */
export function analyzeKinematicShockwave(
  upstreamDensityPerKmPerLane: number,
  downstreamDensityPerKmPerLane: number,
  freeFlowSpeedKmh: number,
  jamDensityPerKmPerLane = 135
): ShockwaveAnalysis {
  const q1 = calculateKinematicFlow(upstreamDensityPerKmPerLane, freeFlowSpeedKmh, jamDensityPerKmPerLane);
  const q2 = calculateKinematicFlow(downstreamDensityPerKmPerLane, freeFlowSpeedKmh, jamDensityPerKmPerLane);

  const deltaK = downstreamDensityPerKmPerLane - upstreamDensityPerKmPerLane;
  const deltaQ = q2 - q1;

  let shockwaveVelocityKmh = 0;
  if (Math.abs(deltaK) > 0.001) {
    shockwaveVelocityKmh = deltaQ / deltaK;
  }

  const isBackwardPropagating = shockwaveVelocityKmh < 0;

  return {
    upstreamDensity: upstreamDensityPerKmPerLane,
    downstreamDensity: downstreamDensityPerKmPerLane,
    upstreamFlow: q1,
    downstreamFlow: q2,
    shockwaveVelocityKmh,
    isBackwardPropagating,
    estimatedArrivalTimeAtDistanceSeconds: (distanceMeters: number) => {
      const speedMs = (Math.abs(shockwaveVelocityKmh) * 1000) / 3600;
      if (speedMs <= 0.1) return Infinity;
      return distanceMeters / speedMs;
    },
  };
}

/**
 * Hydrodynamic flood clearance assessment.
 * Evaluates whether a rising flood will submerge the road before a commuter can traverse it.
 */
export function assessFloodClearance(
  currentDepthCm: number,
  criticalDepthCm: number,
  floodRiseRateCmPerHour: number,
  anticipatedTraversalTimeSeconds: number
): FloodClearanceAssessment {
  const remainingFreeboardCm = Math.max(0, criticalDepthCm - currentDepthCm);
  const isCurrentlySubmerged = currentDepthCm >= criticalDepthCm;

  let timeToSubmergeSeconds = Infinity;
  if (floodRiseRateCmPerHour > 0 && !isCurrentlySubmerged) {
    const riseRatePerSec = floodRiseRateCmPerHour / 3600;
    timeToSubmergeSeconds = remainingFreeboardCm / riseRatePerSec;
  } else if (isCurrentlySubmerged) {
    timeToSubmergeSeconds = 0;
  }

  // Preemptively unsafe if flood crest arrives before vehicle finishes traversing
  const isPreemptivelyUnsafe = isCurrentlySubmerged || (timeToSubmergeSeconds <= anticipatedTraversalTimeSeconds * 1.2);

  return {
    currentDepthCm,
    criticalDepthCm,
    remainingFreeboardCm,
    timeToSubmergeSeconds,
    isCurrentlySubmerged,
    isPreemptivelyUnsafe,
  };
}
