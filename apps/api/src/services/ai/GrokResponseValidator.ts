import {
  GrokDecisionOutput,
  GrokDecisionOutputSchema,
  CanonicalAIContext,
  RouteRecommendationAction,
} from '@smartcity/shared';
import { logger } from '../../utils/logger.js';

export interface ValidationResult {
  isValid: boolean;
  validatedDecision?: GrokDecisionOutput;
  errors: string[];
  unverifiedClaims: string[];
  validationStatus: 'VALIDATED' | 'VALIDATED_WITH_WARNINGS' | 'REJECTED_FALLBACK';
}

export class GrokResponseValidator {
  /**
   * Executes the 4-tier validation pipeline:
   * 1. JSON Parse Verification
   * 2. Strict Zod Schema & Enum Validation
   * 3. Business Rule Validation (Backend Authority Supremacy)
   * 4. Safety Constraints & Confidence Harmonization
   */
  public validate(rawResponse: unknown, context: CanonicalAIContext): ValidationResult {
    const errors: string[] = [];
    const unverifiedClaims: string[] = [];

    // Tier 1: JSON Parsing check (if given a string, parse it)
    let parsed: unknown = rawResponse;
    if (typeof rawResponse === 'string') {
      try {
        parsed = JSON.parse(rawResponse);
      } catch (e) {
        return {
          isValid: false,
          errors: [`Malformed JSON: ${(e as Error).message}`],
          unverifiedClaims: [],
          validationStatus: 'REJECTED_FALLBACK',
        };
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        isValid: false,
        errors: ['AI response payload is empty or not an object'],
        unverifiedClaims: [],
        validationStatus: 'REJECTED_FALLBACK',
      };
    }

    // Tier 2: Strict Zod Schema & Enum Validation
    const schemaResult = GrokDecisionOutputSchema.safeParse(parsed);
    if (!schemaResult.success) {
      const issueDetails = schemaResult.error.issues
        .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
        .join('; ');
      logger.warn('Grok AI response failed strict schema validation', { details: { issue: issueDetails } });
      return {
        isValid: false,
        errors: [`Schema validation failed: ${issueDetails}`],
        unverifiedClaims: [],
        validationStatus: 'REJECTED_FALLBACK',
      };
    }

    const decision: GrokDecisionOutput = schemaResult.data;

    // Tier 3: Business Rule Validation (Backend Truth Supremacy)
    // Rule 3.1: Road closure enforcement
    const backendBlockedRoads = context.roads.affected
      .filter((r) => r.state === 'BLOCKED')
      .map((r) => r.name.toLowerCase());

    const backendOpenRoads = context.roads.affected
      .filter((r) => r.state === 'OPEN')
      .map((r) => r.name.toLowerCase());

    // Check if Grok claims any officially OPEN road is to avoid or blocked
    if (Array.isArray(decision.roads_to_avoid)) {
      for (const road of decision.roads_to_avoid) {
        const roadLower = road.toLowerCase();
        if (backendOpenRoads.includes(roadLower)) {
          unverifiedClaims.push(`AI claimed road '${road}' to avoid, but backend state is verified OPEN.`);
        }
      }
    }

    // Rule 3.2: If backend says a road is BLOCKED, Grok CANNOT recommend KEEP_ROUTE if route uses it
    if (backendBlockedRoads.length > 0 && context.route?.risk?.isBlocked) {
      if (decision.route_recommendation.action === 'KEEP_ROUTE') {
        errors.push(
          'Safety Violation: Grok recommended KEEP_ROUTE while the active route intersects verified BLOCKED corridors.'
        );
        // Correct to REROUTE_REQUIRED
        decision.route_recommendation.action = 'REROUTE_REQUIRED';
        decision.route_recommendation.reason = `Enforced by Safety Validator: Route intersects verified blocked road (${backendBlockedRoads[0]}). Reroute required.`;
      }
    }

    // Rule 3.3: Missing data must never produce NORMAL (Rule 14)
    const isFloodDataUnavailable =
      context.dataQuality.confidence.telemetryHealth === 'UNAVAILABLE' ||
      context.flood.confidence < 0.2;

    if (isFloodDataUnavailable) {
      if (decision.risk_level === 'NORMAL') {
        errors.push(
          'Safety Violation: Grok converted missing/unavailable flood data into NORMAL. Converting to UNKNOWN.'
        );
        decision.risk_level = 'UNKNOWN';
        if (!decision.uncertainties.includes('Live flood observations are unavailable.')) {
          decision.uncertainties.push('Live flood observations are unavailable.');
        }
      }
    }

    // Tier 4: Confidence Harmonization (Section 13)
    // decision_confidence = min(system_confidence, ai_confidence)
    const systemConfidence = context.dataQuality.confidence.systemConfidence ?? context.flood.confidence ?? 0.8;
    const aiConfidence = decision.confidence;
    decision.decision_confidence = Number(Math.min(systemConfidence, aiConfidence).toFixed(2));

    // Attach unverified claims for auditability
    decision.unverified_claims = unverifiedClaims;

    const validationStatus =
      errors.length > 0
        ? 'REJECTED_FALLBACK'
        : unverifiedClaims.length > 0
          ? 'VALIDATED_WITH_WARNINGS'
          : 'VALIDATED';

    return {
      isValid: errors.length === 0,
      validatedDecision: decision,
      errors,
      unverifiedClaims,
      validationStatus,
    };
  }
}

export const grokResponseValidator = new GrokResponseValidator();
