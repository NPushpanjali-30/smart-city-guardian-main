import { WeatherObservation, WeatherForecast } from '@smartcity/shared';
import { WeatherProvider } from './weatherProvider.interface.js';
import { MockWeatherAdapter } from './mockWeatherAdapter.js';
import { CircuitBreaker } from '../common/circuitBreaker.js';
import { evaluateFreshness, DEFAULT_WEATHER_FRESHNESS_CONFIG } from '../common/freshness.js';
import { logger } from '../../utils/logger.js';

export class OpenMeteoAdapter implements WeatherProvider {
  public readonly name = 'open-meteo';
  public readonly isLive = true;

  private circuitBreaker: CircuitBreaker;
  private fallbackAdapter: MockWeatherAdapter;
  private baseUrl: string;

  constructor(baseUrl = 'https://api.open-meteo.com/v1/forecast', cbOptions?: Partial<import('../common/circuitBreaker.js').CircuitBreakerOptions>) {
    this.baseUrl = baseUrl;
    this.circuitBreaker = new CircuitBreaker('OpenMeteoWeather', {
      failureThreshold: cbOptions?.failureThreshold ?? 4,
      resetTimeoutMs: cbOptions?.resetTimeoutMs ?? 30000,
      requestTimeoutMs: cbOptions?.requestTimeoutMs ?? 5000,
      maxRetries: cbOptions?.maxRetries ?? 2,
    });
    this.fallbackAdapter = new MockWeatherAdapter();
  }

  async getCurrentWeather(latitude: number, longitude: number): Promise<WeatherObservation> {
    // Validate geographical boundaries
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error(`Invalid geographic coordinates: lat=${latitude}, lon=${longitude}`);
    }

    try {
      return await this.circuitBreaker.execute(async (signal) => {
        const url = `${this.baseUrl}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m&timezone=auto`;
        const startTime = Date.now();
        const res = await fetch(url, { signal });

        if (!res.ok) {
          throw new Error(`Open-Meteo HTTP error: status ${res.status}`);
        }

        const data = await res.json() as {
          current?: {
            time?: string;
            temperature_2m?: number;
            relative_humidity_2m?: number;
            precipitation?: number;
            rain?: number;
            wind_speed_10m?: number;
          };
        };

        const current = data.current;
        if (!current) {
          throw new Error('Open-Meteo response missing "current" payload');
        }

        const sourceTimestamp = current.time ? new Date(current.time).toISOString() : new Date().toISOString();
        const { freshness, dataAgeSeconds } = evaluateFreshness(
          sourceTimestamp,
          DEFAULT_WEATHER_FRESHNESS_CONFIG,
          new Date(),
          false
        );

        // Current rainfall intensity calculation (mm/h approximation from current reading)
        const rainfallRateMmh = Math.max(0, (current.precipitation ?? 0) * 10);
        const rainfall1hMm = Math.max(0, current.precipitation ?? 0);

        logger.info('Open-Meteo live weather retrieved successfully', {
          operation: 'weather.open_meteo',
          durationMs: Date.now() - startTime,
          details: { latitude, longitude, rainfallRateMmh, freshness },
        });

        return {
          id: `wx_om_${Date.now()}`,
          source: this.name,
          timestamp: sourceTimestamp,
          receivedAt: new Date().toISOString(),
          location: {
            name: `Metro Sector (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
            latitude,
            longitude,
          },
          temperatureC: current.temperature_2m ?? 20.0,
          humidityPercent: current.relative_humidity_2m ?? 75.0,
          rainfallRateMmh,
          rainfall1hMm,
          rainfall24hMm: Number((rainfall1hMm * 2.5).toFixed(1)),
          windSpeedKmh: current.wind_speed_10m ?? 15.0,
          freshness,
          dataAgeSeconds,
        };
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn(`Open-Meteo live retrieval failed (${error.message}). Falling back to safe mock weather data.`, {
        operation: 'weather.open_meteo_fallback',
      });

      const fallback = await this.fallbackAdapter.getCurrentWeather(latitude, longitude);
      return {
        ...fallback,
        source: `${this.name}:fallback`,
        freshness: 'MOCK',
      };
    }
  }

  async getForecast(latitude: number, longitude: number): Promise<WeatherForecast[]> {
    try {
      return await this.circuitBreaker.execute(async (signal) => {
        const url = `${this.baseUrl}?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,precipitation_probability,precipitation&forecast_days=1&timezone=auto`;
        const res = await fetch(url, { signal });

        if (!res.ok) {
          throw new Error(`Open-Meteo forecast HTTP error: status ${res.status}`);
        }

        const data = await res.json() as {
          hourly?: {
            time?: string[];
            temperature_2m?: number[];
            precipitation_probability?: number[];
            precipitation?: number[];
          };
        };

        const hourly = data.hourly;
        if (!hourly || !hourly.time) {
          return this.fallbackAdapter.getForecast(latitude, longitude);
        }

        const forecasts: WeatherForecast[] = [];
        const limit = Math.min(6, hourly.time.length);

        for (let i = 0; i < limit; i++) {
          const forecastTime = hourly.time[i];
          forecasts.push({
            timestamp: new Date().toISOString(),
            forecastFor: forecastTime,
            latitude,
            longitude,
            precipitationProbability: hourly.precipitation_probability?.[i] ?? 50,
            precipitationAmountMm: hourly.precipitation?.[i] ?? 0.0,
            temperatureC: hourly.temperature_2m?.[i] ?? 20.0,
            source: this.name,
            freshness: 'LIVE',
          });
        }

        return forecasts;
      });
    } catch {
      return this.fallbackAdapter.getForecast(latitude, longitude);
    }
  }
}
