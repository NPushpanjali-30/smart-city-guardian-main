import { EventEmitter } from 'events';
import crypto from 'crypto';
import {
  WeatherObservation,
  WeatherForecast,
  TrafficObservation,
  TrafficIncident,
  FloodObservation,
  DomainEventEnvelope,
  SystemEventType,
} from '@smartcity/shared';
import {
  WeatherProvider,
  OpenMeteoAdapter,
  MockWeatherAdapter,
  TrafficProvider,
  TrafficAdapter,
  FloodProvider,
  FloodAdapter,
  MapProvider,
  MapAdapter,
} from '../providers/index.js';
import { liveStateStore } from './stateStore.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export class DataAggregator extends EventEmitter {
  private weatherProvider: WeatherProvider;
  private trafficProvider: TrafficProvider;
  private floodProvider: FloodProvider;
  private mapProvider: MapProvider;

  private weatherTimer?: NodeJS.Timeout;
  private trafficTimer?: NodeJS.Timeout;
  private floodTimer?: NodeJS.Timeout;

  // Historical in-memory storage (PostgreSQL cache layer)
  public weatherHistory: WeatherObservation[] = [];
  public trafficHistory: TrafficObservation[] = [];
  public floodHistory: FloodObservation[] = [];

  constructor() {
    super();

    // Select provider based on configuration / mock mode
    if (config.MOCK_MODE || config.WEATHER_PROVIDER === 'mock') {
      this.weatherProvider = new MockWeatherAdapter();
    } else {
      this.weatherProvider = new OpenMeteoAdapter();
    }

    this.trafficProvider = new TrafficAdapter('metro-traffic-adapter', !config.MOCK_MODE);
    this.floodProvider = new FloodAdapter('metro-flood-adapter', false); // Live flood feeds unavailable for study area; explicitly labeled mock
    this.mapProvider = new MapAdapter();
  }

  // 1. Ingestion: Weather
  public async refreshWeather(lat = 40.7128, lon = -74.0060): Promise<WeatherObservation> {
    const cacheKey = `weather:current:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const startTime = Date.now();

    return liveStateStore.coalesce(cacheKey, async () => {
      try {
        const observation = await this.weatherProvider.getCurrentWeather(lat, lon);
        const duration = Date.now() - startTime;

        liveStateStore.updateProviderStatus(
          this.weatherProvider.name,
          'weather',
          true,
          duration,
          this.weatherProvider.isLive,
          ['current_weather', 'precipitation', 'hourly_forecast']
        );

        const previous = liveStateStore.get<WeatherObservation>(cacheKey);
        liveStateStore.set(cacheKey, observation, 120); // 120s TTL
        this.weatherHistory.unshift(observation);
        if (this.weatherHistory.length > 200) this.weatherHistory.pop();

        if (liveStateStore.hasWeatherMeaningfullyChanged(previous, observation)) {
          this.emitEvent('WEATHER_UPDATED', this.weatherProvider.name, observation, {
            latitude: lat,
            longitude: lon,
          });

          // Trigger real-time flood intelligence recomputation
          import('./flood/floodIntelligence.service.js')
            .then(({ floodIntelligenceService }) => {
              floodIntelligenceService
                .evaluateRisk({
                  weatherObservation: observation,
                  weatherHistory: this.weatherHistory,
                })
                .catch(() => {});
            })
            .catch(() => {});
        }

        return observation;
      } catch (err: unknown) {
        const duration = Date.now() - startTime;
        const msg = err instanceof Error ? err.message : String(err);
        liveStateStore.updateProviderStatus(
          this.weatherProvider.name,
          'weather',
          false,
          duration,
          this.weatherProvider.isLive,
          ['current_weather'],
          msg
        );
        throw err;
      }
    });
  }

  public async getForecast(lat = 40.7128, lon = -74.0060): Promise<WeatherForecast[]> {
    const cacheKey = `weather:forecast:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    return liveStateStore.coalesce(cacheKey, async () => {
      const forecasts = await this.weatherProvider.getForecast(lat, lon);
      liveStateStore.set(cacheKey, forecasts, 300); // 300s TTL
      return forecasts;
    });
  }

  // 2. Ingestion: Traffic
  public async refreshTraffic(bbox: [number, number, number, number] = [-74.05, 40.68, -73.95, 40.78]): Promise<{ flows: TrafficObservation[]; incidents: TrafficIncident[] }> {
    const cacheKey = `traffic:snapshot:${bbox.join(',')}`;
    const startTime = Date.now();

    return liveStateStore.coalesce(cacheKey, async () => {
      try {
        const [flows, incidents] = await Promise.all([
          this.trafficProvider.getTrafficFlows(bbox),
          this.trafficProvider.getIncidents(bbox),
        ]);
        const duration = Date.now() - startTime;

        liveStateStore.updateProviderStatus(
          this.trafficProvider.name,
          'traffic',
          true,
          duration,
          this.trafficProvider.isLive,
          ['flow_metrics', 'incident_streams']
        );

        const previous = liveStateStore.get<{ flows: TrafficObservation[] }>(cacheKey);
        const snapshot = { flows, incidents };
        liveStateStore.set(cacheKey, snapshot, 60); // 60s TTL

        flows.forEach((f) => this.trafficHistory.unshift(f));
        if (this.trafficHistory.length > 500) this.trafficHistory.length = 500;

        if (liveStateStore.hasTrafficMeaningfullyChanged(previous?.flows || null, flows)) {
          this.emitEvent('TRAFFIC_UPDATED', this.trafficProvider.name, snapshot);
        }

        return snapshot;
      } catch (err: unknown) {
        const duration = Date.now() - startTime;
        const msg = err instanceof Error ? err.message : String(err);
        liveStateStore.updateProviderStatus(
          this.trafficProvider.name,
          'traffic',
          false,
          duration,
          this.trafficProvider.isLive,
          ['flow_metrics'],
          msg
        );
        throw err;
      }
    });
  }

  // 3. Ingestion: Flood
  public async refreshFlood(areaId = 'city-metro'): Promise<FloodObservation[]> {
    const cacheKey = `flood:observations:${areaId}`;
    const startTime = Date.now();

    return liveStateStore.coalesce(cacheKey, async () => {
      try {
        const observations = await this.floodProvider.getFloodObservations(areaId);
        const duration = Date.now() - startTime;

        liveStateStore.updateProviderStatus(
          this.floodProvider.name,
          'flood',
          true,
          duration,
          this.floodProvider.isLive,
          ['basin_depth_levels', 'catchment_risk']
        );

        liveStateStore.set(cacheKey, observations, 120);
        observations.forEach((o) => this.floodHistory.unshift(o));
        if (this.floodHistory.length > 200) this.floodHistory.length = 200;

        this.emitEvent('FLOOD_DATA_UPDATED', this.floodProvider.name, observations);
        return observations;
      } catch (err: unknown) {
        const duration = Date.now() - startTime;
        const msg = err instanceof Error ? err.message : String(err);
        liveStateStore.updateProviderStatus(
          this.floodProvider.name,
          'flood',
          false,
          duration,
          this.floodProvider.isLive,
          ['basin_depth_levels'],
          msg
        );
        throw err;
      }
    });
  }

  // Helper to emit standard DomainEventEnvelope
  private emitEvent<T>(
    eventType: SystemEventType,
    source: string,
    payload: T,
    location?: { latitude: number; longitude: number; zone_id?: string; road_id?: string }
  ): void {
    const event: DomainEventEnvelope<T> = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      source,
      correlation_id: crypto.randomUUID(),
      location,
      payload,
    };

    this.emit('domain_event', event);
  }

  // Background Workers Scheduler
  public startBackgroundWorkers(): void {
    logger.info('Starting centralized background data ingestion workers...');

    // Initial immediate invocation
    this.refreshWeather().catch(() => {});
    this.refreshTraffic().catch(() => {});
    this.refreshFlood().catch(() => {});

    import('./flood/floodIntelligence.service.js')
      .then(({ floodIntelligenceService }) => {
        floodIntelligenceService.evaluateRisk().catch(() => {});
      })
      .catch(() => {});

    // Scheduled recurring intervals
    this.weatherTimer = setInterval(() => {
      this.refreshWeather().catch((e) => logger.warn('Weather background refresh failed', { details: { error: e.message } }));
    }, 300000); // every 5m

    this.trafficTimer = setInterval(() => {
      this.refreshTraffic().catch((e) => logger.warn('Traffic background refresh failed', { details: { error: e.message } }));
    }, 180000); // every 3m

    this.floodTimer = setInterval(() => {
      this.refreshFlood().catch((e) => logger.warn('Flood background refresh failed', { details: { error: e.message } }));
    }, 300000); // every 5m
  }

  public stopBackgroundWorkers(): void {
    if (this.weatherTimer) clearInterval(this.weatherTimer);
    if (this.trafficTimer) clearInterval(this.trafficTimer);
    if (this.floodTimer) clearInterval(this.floodTimer);
    logger.info('Centralized background data workers stopped.');
  }
}

export const dataAggregator = new DataAggregator();
