import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../apps/api/src/app.js';
import { locationRelevanceService } from '../apps/api/src/services/locationRelevance.service.js';
import { Server } from 'http';
import { AddressInfo } from 'net';

describe('Location Relevance & Proximity Alerts', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });


  describe('Proximity Radius Evaluation', () => {
    // Centroid of Bay Basin Lowlands is ~40.715, -74.010
    const basinLat = 40.7150;
    const basinLon = -74.0100;

    it('should match an event 2 km away when ALERT_RADIUS_KM is 10', () => {
      // Offset ~2km north (1 deg lat ~ 111km -> 0.018 deg ~ 2km)
      const userLat = basinLat + 0.018;
      const userLon = basinLon;

      const distance = locationRelevanceService.calculateDistance(userLat, userLon, basinLat, basinLon);
      expect(distance).toBeGreaterThan(1.8);
      expect(distance).toBeLessThan(2.2);

      const events = locationRelevanceService.findNearbyEvents(userLat, userLon, 10);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.eventId === 'zone-bay-basin-01')).toBe(true);
    });

    it('should match an event 9 km away when ALERT_RADIUS_KM is 10', () => {
      // Offset ~9km (0.081 deg lat ~ 9km)
      const userLat = basinLat + 0.081;
      const userLon = basinLon;

      const distance = locationRelevanceService.calculateDistance(userLat, userLon, basinLat, basinLon);
      expect(distance).toBeGreaterThan(8.5);
      expect(distance).toBeLessThan(9.5);

      const events = locationRelevanceService.findNearbyEvents(userLat, userLon, 10);
      expect(events.some((e) => e.eventId === 'zone-bay-basin-01')).toBe(true);
    });

    it('should match an event at 10 km boundary', () => {
      // 0.0898 deg lat is ~9.99 km (<= 10.0 km)
      const userLat = basinLat + 0.0898;
      const userLon = basinLon;

      const distance = locationRelevanceService.calculateDistance(userLat, userLon, basinLat, basinLon);
      expect(distance).toBeLessThanOrEqual(10.0);

      const events = locationRelevanceService.findNearbyEvents(userLat, userLon, 10);
      expect(events.some((e) => e.eventId === 'zone-bay-basin-01')).toBe(true);
    });

    it('should NOT match an event at 10.1 km when ALERT_RADIUS_KM is 10', () => {
      // 0.0910 deg lat is ~10.12 km (> 10.0 km)
      const userLat = basinLat + 0.0910;
      const userLon = basinLon;

      const distance = locationRelevanceService.calculateDistance(userLat, userLon, basinLat, basinLon);
      expect(distance).toBeGreaterThan(10.0);

      const events = locationRelevanceService.findNearbyEvents(userLat, userLon, 10);
      expect(events.some((e) => e.eventId === 'zone-bay-basin-01')).toBe(false);
    });

    it('should strictly provide 10km radius alerts based on user location, excluding hazards outside 10km', () => {
      // User at Koramangala (South-Central Bangalore)
      const koramangalaLat = 12.9352;
      const koramangalaLon = 77.6245;

      const koramangalaEvents = locationRelevanceService.findNearbyEvents(koramangalaLat, koramangalaLon, 10);
      expect(koramangalaEvents.length).toBeGreaterThan(0);

      // Nearby hazards (Silk Board ~2km, Bellandur ~5.7km) must be included
      expect(koramangalaEvents.some((e) => e.eventId === 'zone-silk-board-06')).toBe(true);
      expect(koramangalaEvents.some((e) => e.eventId === 'zone-bellandur-basin-04')).toBe(true);

      // Distant hazards (Hebbal ~12.2km, Kengeri ~15.3km) MUST be excluded from 10km radius
      expect(koramangalaEvents.some((e) => e.eventId === 'zone-hebbal-manyata-08')).toBe(false);
      expect(koramangalaEvents.some((e) => e.eventId === 'zone-kengeri-vrishabhavathi-13')).toBe(false);
      expect(koramangalaEvents.some((e) => e.eventId === 'zone-bay-basin-01')).toBe(false);

      // User at Yelahanka (Far North Bangalore)
      const yelahankaLat = 13.0998;
      const yelahankaLon = 77.5963;

      const yelahankaEvents = locationRelevanceService.findNearbyEvents(yelahankaLat, yelahankaLon, 10);
      // Hebbal is ~6.4km away (<= 10km) -> included
      expect(yelahankaEvents.some((e) => e.eventId === 'zone-hebbal-manyata-08')).toBe(true);
      // Silk Board and Bellandur are > 20km away -> MUST be excluded
      expect(yelahankaEvents.some((e) => e.eventId === 'zone-silk-board-06')).toBe(false);
      expect(yelahankaEvents.some((e) => e.eventId === 'zone-bellandur-basin-04')).toBe(false);
    });
  });

  describe('Location Update Throttling', () => {
    it('should trigger update if interval exceeds LOCATION_UPDATE_INTERVAL_SECONDS (60s)', () => {
      const now = Date.now();
      const sixtyOneSecondsAgo = now - 61000;

      // No movement
      const shouldUpdate = locationRelevanceService.shouldUpdateLocation(
        40.7128,
        -74.0060,
        sixtyOneSecondsAgo,
        40.7128,
        -74.0060,
        now
      );
      expect(shouldUpdate).toBe(true);
    });

    it('should trigger update if movement exceeds LOCATION_MIN_MOVEMENT_METERS (250m) even before 60s', () => {
      const now = Date.now();
      const tenSecondsAgo = now - 10000;

      // Moved ~300 meters north (0.0027 deg lat ~ 300m)
      const shouldUpdate = locationRelevanceService.shouldUpdateLocation(
        40.7128,
        -74.0060,
        tenSecondsAgo,
        40.7155,
        -74.0060,
        now
      );
      expect(shouldUpdate).toBe(true);
    });

    it('should suppress update if both time and distance thresholds are not met', () => {
      const now = Date.now();
      const twentySecondsAgo = now - 20000;

      // Moved only ~10 meters (0.0001 deg lat ~ 11m)
      const shouldUpdate = locationRelevanceService.shouldUpdateLocation(
        40.7128,
        -74.0060,
        twentySecondsAgo,
        40.7129,
        -74.0060,
        now
      );
      expect(shouldUpdate).toBe(false);
    });
  });

  describe('Alert Deduplication & Escalation', () => {
    const testUser = 'user-test-dedup-1';
    const testEvent = 'event-basin-99';

    it('should generate initial alert on first detection', () => {
      const result = locationRelevanceService.evaluateDeduplication(testUser, testEvent, 'LOCATION_ALERT', 'WARNING');
      expect(result.shouldNotify).toBe(true);
      expect(result.deduplicated).toBe(false);
    });

    it('should deduplicate and suppress subsequent alert for identical severity within cooldown', () => {
      const result = locationRelevanceService.evaluateDeduplication(testUser, testEvent, 'LOCATION_ALERT', 'WARNING');
      expect(result.shouldNotify).toBe(false);
      expect(result.deduplicated).toBe(true);
      expect(result.reason).toContain('Suppressed duplicate alert');
    });

    it('should allow new alert when severity escalates (WARNING -> CRITICAL)', () => {
      const result = locationRelevanceService.evaluateDeduplication(testUser, testEvent, 'LOCATION_ALERT', 'CRITICAL');
      expect(result.shouldNotify).toBe(true);
      expect(result.deduplicated).toBe(false);
      expect(result.reason).toContain('escalated');
    });
  });

  describe('Destination-Based Risk Evaluation', () => {
    it('should evaluate destination risk near active flood zone', async () => {
      // Whitefield destination near Bay Basin
      const result = await locationRelevanceService.evaluateDestination('Whitefield');
      expect(result).toBeDefined();
      expect(result?.risk).toBe('CRITICAL');
      expect(result?.nearestEventDistanceKm).toBeLessThan(5.0);
      expect(result?.affectedRoads.length).toBeGreaterThan(0);
      expect(result?.recommendedAction).toContain('submerged');
    });

    it('should evaluate destination risk for safe destination far from hazard', async () => {
      // Highland Crest Ridge is safe (NORMAL severity)
      const result = await locationRelevanceService.evaluateDestination('Highland Ridge', {
        latitude: 40.7800,
        longitude: -74.0200,
      }, 5); // 5km radius
      expect(result).toBeDefined();
      expect(result?.risk).toBe('NORMAL');
      expect(result?.recommendedAction).toContain('normal');
    });
  });

  describe('Location Relevance API Endpoints', () => {
    it('GET /api/v1/location/relevance should return current and destination risk', async () => {
      const res = await fetch(`${baseUrl}/api/v1/location/relevance?lat=40.7128&lon=-74.0060&destination=Hospital&language=en`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.currentLocation).toBeDefined();
      expect(body.data.destination).toBeDefined();
      expect(body.data.notifications).toBeDefined();
      expect(body.meta.source).toBe('location-relevance-service');
    });

    it('POST /api/v1/location/relevance should validate payload and return localized alert', async () => {
      const res = await fetch(`${baseUrl}/api/v1/location/relevance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: 40.7128,
          longitude: -74.0060,
          destination: 'Whitefield Basin',
          language: 'hi',
          userId: 'user-hindi-demo',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.currentLocation.risk).toBeDefined();
      if (body.data.notifications.shouldNotify) {
        expect(body.data.notifications.smsSummary).toBeDefined();
      }
    });

    it('GET /api/v1/location/saved should return user saved destinations', async () => {
      const res = await fetch(`${baseUrl}/api/v1/location/saved?userId=demo-user-1`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(4);
    });

    it('POST /api/v1/location/saved should save a new custom destination', async () => {
      const res = await fetch(`${baseUrl}/api/v1/location/saved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user-1',
          name: 'City Tech Park',
          type: 'WORK',
          latitude: 40.7290,
          longitude: -74.0080,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('City Tech Park');
    });
  });

});
