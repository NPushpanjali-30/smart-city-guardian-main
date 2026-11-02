import { describe, it, expect } from 'vitest';
import {
  formatLocalizedAlert,
  NOTIFICATION_TEMPLATES,
  LanguageCode,
  FloodSeverity,
  GrokDecisionOutputSchema,
} from '@smartcity/shared';

describe('Multilingual Foundation & Localized Alert Fallbacks', () => {
  const languages: LanguageCode[] = ['en', 'hi', 'kn'];
  const severities: FloodSeverity[] = ['NORMAL', 'WATCH', 'WARNING', 'CRITICAL'];
  const alertTypes: Array<'LOCATION_ALERT' | 'DESTINATION_ALERT'> = ['LOCATION_ALERT', 'DESTINATION_ALERT'];

  describe('Template Existence & Translation Integrity', () => {
    it('should support English (en), Hindi (hi), and Kannada (kn)', () => {
      languages.forEach((lang) => {
        expect(NOTIFICATION_TEMPLATES[lang]).toBeDefined();
        alertTypes.forEach((type) => {
          expect(NOTIFICATION_TEMPLATES[lang][type]).toBeDefined();
          severities.forEach((sev) => {
            const template = NOTIFICATION_TEMPLATES[lang][type][sev];
            expect(template).toBeDefined();
            expect(template.title.length).toBeGreaterThan(0);
            expect(template.bodyTemplate.length).toBeGreaterThan(0);
            expect(template.smsTemplate.length).toBeGreaterThan(0);
          });
        });
      });
    });

    it('should produce valid localized alert in English', () => {
      const alert = formatLocalizedAlert({
        language: 'en',
        severity: 'WARNING',
        alertType: 'LOCATION_ALERT',
        distanceKm: 4.2,
        eventName: 'Bay Basin Lowlands',
      });

      expect(alert.language).toBe('en');
      expect(alert.title).toBe('Active Flood Warning');
      expect(alert.body).toContain('4.2 km');
      expect(alert.body).toContain('Bay Basin Lowlands');
      expect(alert.smsSummary).toContain('SMARTCITY WARNING');
    });

    it('should produce valid localized alert in Hindi (hi)', () => {
      const alert = formatLocalizedAlert({
        language: 'hi',
        severity: 'WARNING',
        alertType: 'LOCATION_ALERT',
        distanceKm: 4.2,
        eventName: 'बे बेसिन तराई',
      });

      expect(alert.language).toBe('hi');
      expect(alert.title).toBe('सक्रिय बाढ़ चेतावनी');
      expect(alert.body).toContain('4.2 किमी');
      expect(alert.smsSummary).toContain('स्मार्टसिटी चेतावनी');
    });

    it('should produce valid localized alert in Kannada (kn)', () => {
      const alert = formatLocalizedAlert({
        language: 'kn',
        severity: 'CRITICAL',
        alertType: 'LOCATION_ALERT',
        distanceKm: 2.5,
        eventName: 'ಬೇ ಬೇಸಿನ್',
      });

      expect(alert.language).toBe('kn');
      expect(alert.title).toContain('ತುರ್ತು');
      expect(alert.body).toContain('2.5 ಕಿ.ಮೀ');
      expect(alert.smsSummary).toContain('ಸ್ಮಾರ್ಟ್ ಸಿಟಿ');
    });
  });

  describe('SMS Length Compliance (<= 160 characters)', () => {
    it('all generated SMS summaries must be strictly under 160 characters across all languages', () => {
      languages.forEach((lang) => {
        alertTypes.forEach((type) => {
          severities.forEach((sev) => {
            const alert = formatLocalizedAlert({
              language: lang,
              severity: sev,
              alertType: type,
              distanceKm: 4.8,
              destination: 'City Memorial Hospital',
              eventName: 'Bay Basin Lowlands Sector 4',
            });

            expect(alert.smsSummary.length).toBeLessThanOrEqual(160);
            expect(alert.smsSummary.length).toBeGreaterThan(10);
          });
        });
      });
    });
  });

  describe('Grok Decision Contract Multilingual Extension', () => {
    it('should validate Grok output with language attribute', () => {
      const mockGrokOutput = {
        risk_level: 'WARNING',
        confidence: 0.92,
        affected_zones: ['Sector 4 Lowlands'],
        roads_to_avoid: ['Bay Street'],
        recommended_actions: ['Use Highland Avenue bypass'],
        authority_actions: ['Deploy emergency pumps'],
        citizen_actions: ['Do not cross standing water'],
        sms_summary: 'SMARTCITY WARNING: Flood hazard 3km away. Divert via Highland Ave.',
        language: 'en',
      };

      const result = GrokDecisionOutputSchema.safeParse(mockGrokOutput);
      expect(result.success).toBe(true);
    });
  });
});
