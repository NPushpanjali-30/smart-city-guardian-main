import { describe, it, expect } from 'vitest';
import { getConfig } from '../apps/api/src/config/index.js';

describe('Configuration Loader', () => {
  it('should load default development configuration safely in mock mode', () => {
    const conf = getConfig();

    expect(conf).toBeDefined();
    expect(conf.PORT).toBeGreaterThan(0);
    expect(conf.MOCK_MODE).toBe(true);
    expect(conf.JWT_SECRET).toBeDefined();
    expect(conf.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it('should specify standard mock providers by default', () => {
    const conf = getConfig();

    expect(conf.WEATHER_PROVIDER).toBe('mock');
    expect(conf.TRAFFIC_PROVIDER).toBe('mock');
    expect(conf.MAP_PROVIDER).toBe('mock');
    expect(conf.SMS_PROVIDER).toBe('mock');
  });
});
