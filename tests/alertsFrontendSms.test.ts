import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extract10Digits } from '../apps/web/src/pages/AlertsPage';

describe('Frontend SMS Client & AlertsPage Verification', () => {
  describe('1. extract10Digits Indian Number Parsing', () => {
    it('should extract 10 digits from raw 10-digit mobile number', () => {
      expect(extract10Digits('9876543210')).toBe('9876543210');
    });

    it('should strip +91 prefix and extract 10 digits', () => {
      expect(extract10Digits('+919876543210')).toBe('9876543210');
    });

    it('should strip leading 0 prefix and extract 10 digits', () => {
      expect(extract10Digits('09876543210')).toBe('9876543210');
    });

    it('should strip 0091 prefix and extract 10 digits', () => {
      expect(extract10Digits('00919876543210')).toBe('9876543210');
    });

    it('should handle formatted numbers with spaces, dashes, and parentheses', () => {
      expect(extract10Digits('+91 98765-43210')).toBe('9876543210');
      expect(extract10Digits('+91 (987) 654-3210')).toBe('9876543210');
      expect(extract10Digits('0091 98765 43210')).toBe('9876543210');
      expect(extract10Digits('0 98765 43210')).toBe('9876543210');
      expect(extract10Digits('+91  98765 43210 ')).toBe('9876543210');
    });

    it('should handle undefined, empty, or partial inputs gracefully', () => {
      expect(extract10Digits('')).toBe('');
      expect(extract10Digits(undefined)).toBe('');
      expect(extract10Digits('12345')).toBe('12345');
    });
  });

  describe('2. AlertsPage Source Code Contract Verification', () => {
    const alertsPagePath = path.resolve(__dirname, '../apps/web/src/pages/AlertsPage.tsx');
    const alertsPageContent = fs.readFileSync(alertsPagePath, 'utf8');

    it('should have the country code badge 🇮🇳 +91 locked beside the 10-digit input box', () => {
      expect(alertsPageContent).toContain('🇮🇳 +91');
      expect(alertsPageContent).toContain('Target Recipient Mobile (🇮🇳 +91 Fixed)');
      expect(alertsPageContent).toContain('maxLength={10}');
    });

    it('should include live digit counter with checkmark for 10/10 digits', () => {
      expect(alertsPageContent).toContain('/10 digits');
      expect(alertsPageContent).toContain("phoneDigits.length === 10 ? '✓' : ''");
    });

    it('should feature "Dispatch Alert via Engine" as the sole and direct trigger for dispatching alerts', () => {
      expect(alertsPageContent).toContain('Dispatch Alert via Engine');
      expect(alertsPageContent).toContain('Evaluating Policy & Dispatching via Engine...');
    });

    it('should NOT contain any "Direct SIM SMS" or "WhatsApp Alert" buttons', () => {
      expect(alertsPageContent).not.toMatch(/Direct SIM SMS/i);
      expect(alertsPageContent).not.toMatch(/WhatsApp Alert/i);
      expect(alertsPageContent).not.toMatch(/<button[^>]*>[^<]*Direct SIM[^<]*<\/button>/i);
      expect(alertsPageContent).not.toMatch(/<button[^>]*>[^<]*WhatsApp[^<]*<\/button>/i);
    });

    it('should update feed with status DELIVERED and increment healthy delivery metrics upon dispatch', () => {
      expect(alertsPageContent).toContain("status: 'DELIVERED'");
      expect(alertsPageContent).toContain("providerName = 'SmartCity Sovereign SMS Engine'");
      expect(alertsPageContent).toContain('activeProvider: providerName');
      expect(alertsPageContent).toContain('deliveredCount: delivered');
      expect(alertsPageContent).toContain('totalDispatched: total');
      expect(alertsPageContent).toContain('SmartCity Sovereign SMS Engine');
    });
  });

  describe('3. Production Bundle (dist/assets/index-*.js) Verification', () => {
    const distDir = path.resolve(__dirname, '../apps/web/dist/assets');
    const jsFiles = fs.readdirSync(distDir).filter((f) => f.startsWith('index-') && f.endsWith('.js'));
    const bundleContent = fs.readFileSync(path.join(distDir, jsFiles[0]), 'utf8');

    it('should include country badge 🇮🇳 +91 in production bundle', () => {
      expect(bundleContent).toContain('🇮🇳 +91');
    });

    it('should include digit counter and checkmark logic in production bundle', () => {
      expect(bundleContent).toContain('/10 digits');
      expect(bundleContent).toContain('✓');
    });

    it('should include "Dispatch Alert via Engine" button text in production bundle', () => {
      expect(bundleContent).toContain('Dispatch Alert via Engine');
    });

    it('should NOT include "Direct SIM SMS" or "WhatsApp Alert" buttons in production bundle', () => {
      expect(bundleContent).not.toContain('Direct SIM SMS');
      expect(bundleContent).not.toContain('WhatsApp Alert');
    });

    it('should include SmartCity Sovereign SMS Engine telemetry in production bundle', () => {
      expect(bundleContent).toContain('SmartCity Sovereign SMS Engine');
      expect(bundleContent).toContain('DELIVERED');
    });
  });
});
