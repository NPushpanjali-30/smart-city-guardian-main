import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 6: Trilingual Multilingual Key Parity (EN / HI / KN)', () => {
  const enPath = path.resolve(__dirname, '../apps/web/src/i18n/en/common.json');
  const hiPath = path.resolve(__dirname, '../apps/web/src/i18n/hi/common.json');
  const knPath = path.resolve(__dirname, '../apps/web/src/i18n/kn/common.json');

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));
  const kn = JSON.parse(fs.readFileSync(knPath, 'utf8'));

  const checkKeyParity = (sectionName: string) => {
    expect(en[sectionName]).toBeDefined();
    expect(hi[sectionName]).toBeDefined();
    expect(kn[sectionName]).toBeDefined();

    const enKeys = Object.keys(en[sectionName]);
    const hiKeys = Object.keys(hi[sectionName]);
    const knKeys = Object.keys(kn[sectionName]);

    expect(hiKeys).toEqual(enKeys);
    expect(knKeys).toEqual(enKeys);

    enKeys.forEach((key) => {
      expect(typeof en[sectionName][key]).toBe('string');
      expect(en[sectionName][key].length).toBeGreaterThan(0);

      expect(typeof hi[sectionName][key]).toBe('string');
      expect(hi[sectionName][key].length).toBeGreaterThan(0);

      expect(typeof kn[sectionName][key]).toBe('string');
      expect(kn[sectionName][key].length).toBeGreaterThan(0);
    });
  };

  it('should maintain full key parity for "map_layers"', () => {
    checkKeyParity('map_layers');
  });

  it('should maintain full key parity for "map_legend"', () => {
    checkKeyParity('map_legend');
  });

  it('should maintain full key parity for "route_presentation"', () => {
    checkKeyParity('route_presentation');
  });

  it('should maintain full key parity for "safety_panel"', () => {
    checkKeyParity('safety_panel');
  });

  it('should maintain full key parity for "authority"', () => {
    checkKeyParity('authority');
  });
});
