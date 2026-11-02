import {
  UserNotificationPreferences,
  LanguageCode,
  FloodSeverity,
  NotificationChannel,
} from '@smartcity/shared';
import { logger } from '../../utils/logger.js';

export class UserPreferenceService {
  private preferencesMap: Map<string, UserNotificationPreferences> = new Map();

  constructor() {
    this.seedDefaultPreferences();
  }

  private seedDefaultPreferences(): void {
    const demoPhone = '+919876543210';
    this.preferencesMap.set('demo-user-1', {
      userId: 'demo-user-1',
      phoneNumber: demoPhone,
      phoneNumberMasked: this.maskPhoneNumber(demoPhone),
      smsOptIn: true,
      preferredLanguage: 'en',
      minSeverity: 'WARNING',
      alertRadiusKm: 10,
      channels: { inApp: true, sms: true },
      updatedAt: new Date().toISOString(),
    });

    this.preferencesMap.set('citizen-kannada', {
      userId: 'citizen-kannada',
      phoneNumber: '+919845012345',
      phoneNumberMasked: this.maskPhoneNumber('+919845012345'),
      smsOptIn: true,
      preferredLanguage: 'kn',
      minSeverity: 'WATCH',
      alertRadiusKm: 10,
      channels: { inApp: true, sms: true },
      updatedAt: new Date().toISOString(),
    });

    this.preferencesMap.set('citizen-hindi', {
      userId: 'citizen-hindi',
      phoneNumber: '+919811098765',
      phoneNumberMasked: this.maskPhoneNumber('+919811098765'),
      smsOptIn: true,
      preferredLanguage: 'hi',
      minSeverity: 'WARNING',
      alertRadiusKm: 10,
      channels: { inApp: true, sms: true },
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Masks a phone number for privacy display (e.g., +91 98*** ***10).
   * Preserves country code and final 2 digits; hides middle digits.
   */
  public maskPhoneNumber(phone?: string): string {
    if (!phone) return '';
    const cleaned = phone.trim();
    if (cleaned.length <= 5) return '****';

    // If starts with +, separate prefix
    if (cleaned.startsWith('+')) {
      const countryCode = cleaned.slice(0, 3); // e.g. +91
      const rest = cleaned.slice(3);
      if (rest.length <= 4) {
        return '****';
      }
      const startDigits = rest.slice(0, 2);
      const endDigits = rest.slice(-2);
      return `${countryCode} ${startDigits}*** ***${endDigits}`;
    }

    const start = cleaned.slice(0, 2);
    const end = cleaned.slice(-2);
    return `${start}******${end}`;
  }

  /**
   * Validates E.164 international phone number format: + followed by 7-15 digits.
   */
  public validatePhoneNumber(phone: string): boolean {
    if (!phone) return false;
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    return e164Regex.test(phone.replace(/[\s\-()]/g, ''));
  }

  /**
   * Formats string to strict E.164 if possible
   */
  public normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (/^[6-9]\d{9}$/.test(cleaned)) {
      cleaned = `+91${cleaned}`;
    } else if (/^91[6-9]\d{9}$/.test(cleaned)) {
      cleaned = `+${cleaned}`;
    } else if (/^0[6-9]\d{9}$/.test(cleaned)) {
      cleaned = `+91${cleaned.slice(1)}`;
    } else if (/^0091[6-9]\d{9}$/.test(cleaned)) {
      cleaned = `+91${cleaned.slice(4)}`;
    }
    return cleaned;
  }

  public getPreferences(userId: string): UserNotificationPreferences {
    const existing = this.preferencesMap.get(userId);
    if (existing) {
      return { ...existing };
    }

    // Default preferences for newly encountered users
    const defaultPrefs: UserNotificationPreferences = {
      userId,
      smsOptIn: false,
      preferredLanguage: 'en',
      minSeverity: 'WARNING',
      alertRadiusKm: 10,
      channels: { inApp: true, sms: false },
      updatedAt: new Date().toISOString(),
    };
    this.preferencesMap.set(userId, defaultPrefs);
    return { ...defaultPrefs };
  }

  public updatePreferences(
    userId: string,
    update: Partial<UserNotificationPreferences>
  ): UserNotificationPreferences {
    const current = this.getPreferences(userId);

    let phoneNumber = update.phoneNumber !== undefined ? update.phoneNumber : current.phoneNumber;
    if (phoneNumber) {
      phoneNumber = this.normalizePhoneNumber(phoneNumber);
      if (!this.validatePhoneNumber(phoneNumber)) {
        throw new Error(`Invalid phone number format: ${phoneNumber}. Expected E.164 format (e.g. +919876543210).`);
      }
    }

    const updated: UserNotificationPreferences = {
      ...current,
      userId,
      phoneNumber,
      phoneNumberMasked: phoneNumber ? this.maskPhoneNumber(phoneNumber) : undefined,
      smsOptIn: update.smsOptIn !== undefined ? update.smsOptIn : current.smsOptIn,
      preferredLanguage: update.preferredLanguage !== undefined ? update.preferredLanguage : current.preferredLanguage,
      minSeverity: update.minSeverity !== undefined ? update.minSeverity : current.minSeverity,
      alertRadiusKm: update.alertRadiusKm !== undefined ? update.alertRadiusKm : current.alertRadiusKm,
      channels: update.channels !== undefined ? update.channels : current.channels,
      updatedAt: new Date().toISOString(),
    };

    this.preferencesMap.set(userId, updated);
    logger.info(`[UserPreferenceService] Updated preferences for user ${userId} (SMS opt-in: ${updated.smsOptIn})`);
    return { ...updated };
  }
}

export const userPreferenceService = new UserPreferenceService();
