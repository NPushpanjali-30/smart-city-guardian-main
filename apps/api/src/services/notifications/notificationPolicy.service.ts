import {
  FloodSeverity,
  LanguageCode,
  NotificationTriggerType,
  NotificationChannel,
  UserNotificationPreferences,
} from '@smartcity/shared';
import { userPreferenceService } from './userPreference.service.js';
import { locationRelevanceService } from '../locationRelevance.service.js';
import { logger } from '../../utils/logger.js';

export const SEVERITY_RANKS: Record<FloodSeverity, number> = {
  NORMAL: 0,
  WATCH: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export interface AlertEvaluationCandidate {
  userId: string;
  eventId: string;
  eventName: string;
  severity: FloodSeverity;
  triggerType: NotificationTriggerType;
  channel: NotificationChannel;
  eventCoordinates: [number, number]; // [lat, lon]
  userCoordinates?: [number, number];  // [lat, lon]
  destinationCoordinates?: [number, number]; // [lat, lon]
  routeCoordinates?: [number, number][]; // [[lat, lon], ...]
  eventUpdatedAt?: string;
  waterDepthCm?: number;
  routeDetourName?: string;
  targetPhoneNumber?: string;
  bypassCooldown?: boolean;
}

export interface EligibilityEvaluationResult {
  eligible: boolean;
  rejectionCode?:
    | 'STALE_DATA'
    | 'SEVERITY_BELOW_THRESHOLD'
    | 'SEVERITY_NORMAL'
    | 'BEYOND_ALERT_RADIUS'
    | 'OPT_OUT'
    | 'CHANNEL_DISABLED'
    | 'MISSING_RECIPIENT_PHONE'
    | 'SUPPRESSED_COOLDOWN'
    | 'UNKNOWN_LOCATION';
  reason: string;
  severity: FloodSeverity;
  distanceKm: number;
  bypassCooldown: boolean;
  deduplicated: boolean;
  recipientPhoneMasked?: string;
  recipientPhone?: string;
  preferredLanguage: LanguageCode;
  matchedRadiusType?: 'CURRENT_LOCATION' | 'DESTINATION' | 'ROUTE';
}

interface CooldownKeyRecord {
  lastSeverity: FloodSeverity;
  lastSeverityRank: number;
  lastTriggeredAtMs: number;
}

export class NotificationPolicyService {
  private alertHistory: Map<string, CooldownKeyRecord> = new Map();
  private defaultCooldownMs = 60 * 60 * 1000; // 60 minutes
  private maxFreshnessMs = 30 * 60 * 1000; // 30 minutes freshness window

  // Telemetry counters
  private metrics = {
    evaluationsCount: 0,
    eligibleCount: 0,
    suppressionCount: 0,
    escalationBypassCount: 0,
  };

  /**
   * Evaluates if a notification is eligible to be dispatched according to
   * system safety rules, freshness, geographic proximity, user preferences, and deduplication cooldowns.
   */
  public evaluateEligibility(
    candidate: AlertEvaluationCandidate,
    options?: {
      cooldownMs?: number;
      freshnessWindowMs?: number;
      nowMs?: number;
      bypassCooldown?: boolean;
    }
  ): EligibilityEvaluationResult {
    this.metrics.evaluationsCount++;
    const nowMs = options?.nowMs ?? Date.now();
    const cooldownMs = options?.cooldownMs ?? this.defaultCooldownMs;
    const freshnessWindowMs = options?.freshnessWindowMs ?? this.maxFreshnessMs;

    const prefs: UserNotificationPreferences = userPreferenceService.getPreferences(candidate.userId);
    const targetPhone = candidate.targetPhoneNumber || prefs.phoneNumber;
    const targetPhoneMasked = targetPhone ? userPreferenceService.maskPhoneNumber(targetPhone) : prefs.phoneNumberMasked;

    // 1. Freshness check: data must not be older than freshnessWindowMs
    if (candidate.eventUpdatedAt) {
      const eventTimeMs = new Date(candidate.eventUpdatedAt).getTime();
      if (!isNaN(eventTimeMs) && nowMs - eventTimeMs > freshnessWindowMs) {
        return {
          eligible: false,
          rejectionCode: 'STALE_DATA',
          reason: `Event data is stale (${Math.round((nowMs - eventTimeMs) / 60000)}m old, exceeds ${Math.round(freshnessWindowMs / 60000)}m limit)`,
          severity: candidate.severity,
          distanceKm: 0,
          bypassCooldown: false,
          deduplicated: false,
          preferredLanguage: prefs.preferredLanguage,
        };
      }
    }

    // 2. Active severity check: NORMAL events should never trigger emergency notifications
    if (candidate.severity === 'NORMAL') {
      return {
        eligible: false,
        rejectionCode: 'SEVERITY_NORMAL',
        reason: 'Event severity is NORMAL; no citizen notification required',
        severity: candidate.severity,
        distanceKm: 0,
        bypassCooldown: false,
        deduplicated: false,
        preferredLanguage: prefs.preferredLanguage,
      };
    }

    // 3. User opt-in and channel check
    if (candidate.channel === 'SMS') {
      if (!prefs.smsOptIn && !candidate.targetPhoneNumber) {
        return {
          eligible: false,
          rejectionCode: 'OPT_OUT',
          reason: `User ${candidate.userId} has not opted into SMS notifications`,
          severity: candidate.severity,
          distanceKm: 0,
          bypassCooldown: false,
          deduplicated: false,
          preferredLanguage: prefs.preferredLanguage,
        };
      }
      const isSmsActive = Array.isArray(prefs.channels)
        ? (prefs.channels as string[]).includes('SMS')
        : Boolean((prefs.channels as any)?.sms);

      if (!isSmsActive && !candidate.targetPhoneNumber) {
        return {
          eligible: false,
          rejectionCode: 'CHANNEL_DISABLED',
          reason: 'SMS channel is not enabled in user preferences',
          severity: candidate.severity,
          distanceKm: 0,
          bypassCooldown: false,
          deduplicated: false,
          preferredLanguage: prefs.preferredLanguage,
        };
      }
      if (!targetPhone) {
        return {
          eligible: false,
          rejectionCode: 'MISSING_RECIPIENT_PHONE',
          reason: 'User does not have a registered phone number for SMS',
          severity: candidate.severity,
          distanceKm: 0,
          bypassCooldown: false,
          deduplicated: false,
          preferredLanguage: prefs.preferredLanguage,
        };
      }
    }

    // 4. User minimum severity threshold check
    const candidateRank = SEVERITY_RANKS[candidate.severity] ?? 0;
    const minRank = SEVERITY_RANKS[prefs.minSeverity] ?? 2; // Default WARNING
    if (candidateRank < minRank && !candidate.bypassCooldown) {
      return {
        eligible: false,
        rejectionCode: 'SEVERITY_BELOW_THRESHOLD',
        reason: `Severity ${candidate.severity} is below user configured minimum threshold ${prefs.minSeverity}`,
        severity: candidate.severity,
        distanceKm: 0,
        bypassCooldown: false,
        deduplicated: false,
        preferredLanguage: prefs.preferredLanguage,
      };
    }

    // 5. Geographic Proximity Check (10 km radius or user's custom alertRadiusKm)
    const alertRadiusKm = prefs.alertRadiusKm || 10;
    let minDistanceKm = Infinity;
    let matchedRadiusType: 'CURRENT_LOCATION' | 'DESTINATION' | 'ROUTE' | undefined;

    const [eLat, eLon] = candidate.eventCoordinates;

    // Check Current Location
    if (candidate.userCoordinates) {
      const [uLat, uLon] = candidate.userCoordinates;
      const dist = locationRelevanceService.calculateDistance(uLat, uLon, eLat, eLon);
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
        matchedRadiusType = 'CURRENT_LOCATION';
      }
    }

    // Check Destination
    if (candidate.destinationCoordinates) {
      const [dLat, dLon] = candidate.destinationCoordinates;
      const dist = locationRelevanceService.calculateDistance(dLat, dLon, eLat, eLon);
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
        matchedRadiusType = 'DESTINATION';
      }
    }

    // Check Route Waypoints
    if (candidate.routeCoordinates && candidate.routeCoordinates.length > 0) {
      for (const [rLat, rLon] of candidate.routeCoordinates) {
        const dist = locationRelevanceService.calculateDistance(rLat, rLon, eLat, eLon);
        if (dist < minDistanceKm) {
          minDistanceKm = dist;
          matchedRadiusType = 'ROUTE';
        }
      }
    }

    if (minDistanceKm === Infinity) {
      return {
        eligible: false,
        rejectionCode: 'UNKNOWN_LOCATION',
        reason: 'No user location, destination, or route coordinates provided for proximity evaluation',
        severity: candidate.severity,
        distanceKm: 0,
        bypassCooldown: false,
        deduplicated: false,
        preferredLanguage: prefs.preferredLanguage,
      };
    }

    if (minDistanceKm > alertRadiusKm && !candidate.bypassCooldown) {
      return {
        eligible: false,
        rejectionCode: 'BEYOND_ALERT_RADIUS',
        reason: `Hazard is ${minDistanceKm}km away, exceeding notification radius threshold of ${alertRadiusKm}km`,
        severity: candidate.severity,
        distanceKm: minDistanceKm,
        bypassCooldown: false,
        deduplicated: false,
        preferredLanguage: prefs.preferredLanguage,
      };
    }

    // 6. Deduplication and Escalation Bypass Check
    // Stable identity key: userId + eventId + triggerType + channel
    const dedupKey = `${candidate.userId}:${candidate.eventId}:${candidate.triggerType}:${candidate.channel}`;
    const previousRecord = this.alertHistory.get(dedupKey);

    let bypassCooldown = Boolean(candidate.bypassCooldown || options?.bypassCooldown);
    let deduplicated = false;

    if (previousRecord) {
      const timeSinceLastMs = nowMs - previousRecord.lastTriggeredAtMs;
      const isWithinCooldown = timeSinceLastMs < cooldownMs;

      // Escalation check or manual bypass: if severity rank increased or bypassCooldown requested, bypass cooldown immediately
      if (candidateRank > previousRecord.lastSeverityRank || bypassCooldown) {
        bypassCooldown = true;
        this.metrics.escalationBypassCount++;
        logger.info(
          `[NotificationPolicy] Escalation or bypass triggered for ${candidate.userId}: ${previousRecord.lastSeverity} -> ${candidate.severity}`
        );
      } else if (isWithinCooldown) {
        deduplicated = true;
        this.metrics.suppressionCount++;
        const remainingMin = Math.ceil((cooldownMs - timeSinceLastMs) / 60000);
        return {
          eligible: false,
          rejectionCode: 'SUPPRESSED_COOLDOWN',
          reason: `Duplicate alert suppressed by 60m cooldown (${remainingMin}m remaining for ${candidate.severity})`,
          severity: candidate.severity,
          distanceKm: minDistanceKm,
          bypassCooldown: false,
          deduplicated: true,
          recipientPhoneMasked: targetPhoneMasked,
          preferredLanguage: prefs.preferredLanguage,
          matchedRadiusType,
        };
      }
    }

    // Record decision in history
    this.alertHistory.set(dedupKey, {
      lastSeverity: candidate.severity,
      lastSeverityRank: candidateRank,
      lastTriggeredAtMs: nowMs,
    });

    this.metrics.eligibleCount++;

    return {
      eligible: true,
      reason: bypassCooldown
        ? `Eligible: Manual bypass / severity escalation to ${candidate.severity} (${minDistanceKm}km from ${matchedRadiusType})`
        : `Eligible within ${minDistanceKm}km of ${matchedRadiusType} (Severity: ${candidate.severity})`,
      severity: candidate.severity,
      distanceKm: minDistanceKm,
      bypassCooldown,
      deduplicated,
      recipientPhone: targetPhone,
      recipientPhoneMasked: targetPhoneMasked,
      preferredLanguage: prefs.preferredLanguage,
      matchedRadiusType,
    };
  }

  public getMetrics() {
    return { ...this.metrics };
  }

  public clearCooldownHistory(): void {
    this.alertHistory.clear();
  }
}

export const notificationPolicyService = new NotificationPolicyService();
