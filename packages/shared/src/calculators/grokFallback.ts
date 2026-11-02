import { GrokDecisionOutput, GrokInputContext } from '../types/index.js';

/**
 * Deterministically generates a structured emergency action plan when Grok AI is
 * unavailable, times out, or produces schema validation errors.
 */
export function generateDeterministicFallbackDecision(
  input: GrokInputContext,
  reason = 'Autonomous fallback triggered'
): GrokDecisionOutput {
  const isCritical = input.floodRisk.compositeScore >= 75;
  const isWarning = input.floodRisk.compositeScore >= 50;
  const isWatch = input.floodRisk.compositeScore >= 25;

  const risk_level = isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : isWatch ? 'WATCH' : 'NORMAL';

  const blockedRoads = input.roads.filter((r) => r.state === 'BLOCKED').map((r) => r.name);
  const cautionRoads = input.roads.filter((r) => r.state === 'HIGH_RISK').map((r) => r.name);
  const roadsToAvoid = [...blockedRoads, ...cautionRoads];

  const primaryAvoidRoad = roadsToAvoid[0] || 'low-lying underpasses';
  const targetZone = input.floodRisk.highRiskBasins[0] || input.location.cityName;

  let smsSummary = '';
  if (isCritical) {
    smsSummary = `FLASH FLOOD CRITICAL: High water near ${primaryAvoidRoad}. Avoid underpasses. Use high-elevation routes.`;
  } else if (isWarning) {
    smsSummary = `FLOOD WARNING: Water pooling on ${primaryAvoidRoad}. Reduce speed and follow designated detours.`;
  } else if (isWatch) {
    smsSummary = `WEATHER WATCH: Heavy rain in ${targetZone}. Drive with caution and monitor road conditions.`;
  } else {
    smsSummary = `SMARTCITY ADVISORY: Normal transit conditions across ${targetZone}. Safe travels.`;
  }

  // Ensure SMS is strictly within 160 characters
  smsSummary = smsSummary.slice(0, 160);

  // Route recommendation derived from blocked and high risk roads
  const hasBlockedCorridor = blockedRoads.length > 0;
  const hasCautionCorridor = cautionRoads.length > 0;
  const routeAction = hasBlockedCorridor
    ? 'REROUTE_REQUIRED'
    : hasCautionCorridor
      ? 'CONSIDER_ALTERNATIVE'
      : 'KEEP_ROUTE';

  const routeReason = hasBlockedCorridor
    ? `Direct corridor closure detected on ${blockedRoads.join(', ')} due to inundation.`
    : hasCautionCorridor
      ? `Elevated water hazard observed along ${cautionRoads.join(', ')}.`
      : 'Current transit corridor operates without material environmental restriction.';

  const lang = input.preferred_language || 'en';
  const shouldNotify = isWarning || isCritical;
  const notifPriority = isCritical ? 'URGENT' : isWarning ? 'WARNING' : isWatch ? 'INFO' : 'NONE';

  const situationSummary = isCritical
    ? `Severe water accumulation and active corridor blockages detected in ${targetZone}. Life safety precautions in effect.`
    : isWarning
      ? `Increasing flood risk and localized inundation observed in ${targetZone}. Heightened transit caution advised.`
      : isWatch
        ? `Moderate rainfall accumulation monitoring underway across ${targetZone}. Normal transit operations with caution.`
        : `Environmental and mobility conditions within normal operational baselines across ${targetZone}.`;

  return {
    risk_level,
    confidence: Number((input.confidenceScore * 0.9).toFixed(2)),
    situation_summary: situationSummary,
    affected_zones:
      input.floodRisk.highRiskBasins.length > 0
        ? input.floodRisk.highRiskBasins
        : [input.location.cityName],
    roads_to_avoid: roadsToAvoid.length > 0 ? roadsToAvoid : ['Low-lying corridors'],
    recommended_actions: [
      `Avoid flood-vulnerable corridors in ${targetZone}.`,
      'Utilize safety-weighted alternate routes on higher ground.',
      `Fallback operational mode active (${reason}).`,
    ],
    authority_actions: [
      'Inspect storm drainage culverts and clear debris in active basins.',
      'Pre-position warning barricades on identified hazardous segments.',
    ],
    citizen_actions: [
      'Delay non-essential transit through affected low-elevation zones.',
      'Never drive through standing water of unknown depth.',
    ],
    route_recommendation: {
      action: routeAction,
      reason: routeReason,
    },
    notification: {
      should_notify: shouldNotify,
      priority: notifPriority,
      language: lang,
      message: smsSummary,
    },
    uncertainties:
      input.confidenceScore < 0.7
        ? ['Sparse real-time telemetry inputs; deterministic fallback applied with reduced confidence.']
        : [],
    sms_summary: smsSummary,
    language: lang,
    decision_confidence: Number((input.confidenceScore * 0.9).toFixed(2)),
  };
}
