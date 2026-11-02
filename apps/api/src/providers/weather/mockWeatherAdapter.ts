import fs from 'fs';
import path from 'path';
import { WeatherObservation, WeatherForecast } from '@smartcity/shared';
import { WeatherProvider } from './weatherProvider.interface.js';
import { resolveMockPath } from '../../utils/mockPath.js';

export class MockWeatherAdapter implements WeatherProvider {
  public readonly name = 'mock-weather-service';
  public readonly isLive = false;

  private loadMockData() {
    try {
      const mockPath = resolveMockPath('mock/weather.json');
      if (fs.existsSync(mockPath)) {
        return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return {
      provider: 'mock-weather-service',
      locationName: 'Metro District',
      latitude: 40.7128,
      longitude: -74.0060,
      rainfallRateMmh: 35.0,
      rainfall1hMm: 28.0,
      rainfall24hMm: 75.0,
      temperatureC: 22.0,
      humidityPercent: 92.0,
      windSpeedKmh: 40.0,
      observedAt: new Date().toISOString(),
      forecast: [],
    };
  }

  async getCurrentWeather(latitude: number, longitude: number): Promise<WeatherObservation> {
    const raw = this.loadMockData();
    return {
      id: `wx_mock_${Date.now()}`,
      source: this.name,
      timestamp: raw.observedAt || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      location: {
        name: raw.locationName || 'Metro District',
        latitude,
        longitude,
      },
      temperatureC: raw.temperatureC ?? 22.0,
      humidityPercent: raw.humidityPercent ?? 92.0,
      rainfallRateMmh: raw.rainfallRateMmh ?? 35.0,
      rainfall1hMm: raw.rainfall1hMm ?? 28.0,
      rainfall24hMm: raw.rainfall24hMm ?? 75.0,
      windSpeedKmh: raw.windSpeedKmh ?? 40.0,
      freshness: 'MOCK',
      dataAgeSeconds: 0,
    };
  }

  async getForecast(latitude: number, longitude: number): Promise<WeatherForecast[]> {
    const raw = this.loadMockData();
    const list = raw.forecast || [];
    return list.map((item: { forecastFor: string; expectedRainfallMm: number; precipitationProbability: number }, idx: number) => ({
      timestamp: new Date().toISOString(),
      forecastFor: item.forecastFor || new Date(Date.now() + (idx + 1) * 3600000).toISOString(),
      latitude,
      longitude,
      precipitationProbability: Math.round((item.precipitationProbability ?? 0.8) * 100),
      precipitationAmountMm: item.expectedRainfallMm ?? 15.0,
      temperatureC: 21.0,
      source: this.name,
      freshness: 'MOCK',
    }));
  }
}
