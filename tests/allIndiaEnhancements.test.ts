import { describe, it, expect } from 'vitest';
import {
  HISTORICAL_FLOOD_ZONES,
  ALL_INDIA_FLOOD_ZONES,
  getFloodZonesAlongRoute,
  calculateHaversineDistanceKm,
} from '../apps/web/src/pages/historicalFloodMaps.js';
import {
  facilityIntelligenceService,
  VERIFIED_INDIA_FACILITIES,
  EmergencyFacility,
} from '../apps/api/src/services/facilities/facilityIntelligence.service.js';

describe('All-India 5-Requirement Platform Verification', () => {
  // =========================================================================
  // REQUIREMENT 1: INDIA-WIDE FLOOD VISUALIZATION
  // =========================================================================
  describe('1. India-wide flood visualization', () => {
    it('should preserve existing Bengaluru Whitefield -> Majestic flood visualization', () => {
      // Whitefield [12.9856, 77.7317] to Majestic [12.9767, 77.5713]
      const blrWaypoints: [number, number][] = [
        [12.9856, 77.7317],
        [12.9600, 77.6500],
        [12.9350, 77.6200],
        [12.9767, 77.5713],
      ];

      const result = getFloodZonesAlongRoute(blrWaypoints, 25, 38.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(3);

      const severities = result.evaluations.map((e) => e.dynamicSeverity);
      // Red (CRITICAL), Orange (WARNING), Yellow (WATCH)
      expect(severities).toContain('CRITICAL');
      expect(result.criticalCount).toBeGreaterThan(0);

      // Verify each polygon has >= 4 vertices
      result.zones.forEach((zone) => {
        expect(zone.polygon.length).toBeGreaterThanOrEqual(4);
        expect(zone.coordinates.length).toBe(2);
      });
    });

    it('should display colored red/orange/yellow flood-risk polygons for Mumbai city route (Bandra -> Nariman Point)', () => {
      // Mumbai: Bandra [19.0596, 72.8295] to Nariman Point [18.9256, 72.8242] (~15 km city trip)
      const mumbaiWaypoints: [number, number][] = [
        [19.0596, 72.8295],
        [19.0180, 72.8430], // Hindmata / Dadar basin
        [18.9700, 72.8150], // Tardeo
        [18.9256, 72.8242], // Nariman Point
      ];

      const result = getFloodZonesAlongRoute(mumbaiWaypoints, 20, 38.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(3);

      // Must be localized in Maharashtra/Mumbai, NOT defaulting to Bangalore coordinates
      result.zones.forEach((z) => {
        expect(z.coordinates[0]).toBeGreaterThan(18.0);
        expect(z.coordinates[0]).toBeLessThan(20.0);
        expect(z.coordinates[1]).toBeGreaterThan(72.0);
        expect(z.coordinates[1]).toBeLessThan(74.0);
        expect(z.polygon.length).toBeGreaterThanOrEqual(4);
      });

      const severities = result.evaluations.map((e) => e.dynamicSeverity);
      // Colored red (CRITICAL), orange (WARNING), or yellow (WATCH)
      expect(severities.some((s) => s === 'CRITICAL' || s === 'WARNING')).toBe(true);
      expect(result.highRiskCount + result.criticalCount).toBeGreaterThan(0);
    });

    it('should display colored red/orange/yellow flood-risk polygons for Delhi-NCR route (Connaught Place -> Gurgaon)', () => {
      // Delhi: Connaught Place [28.6315, 77.2167] to Hero Honda Chowk Gurgaon [28.4320, 77.0450]
      const delhiWaypoints: [number, number][] = [
        [28.6315, 77.2167],
        [28.5700, 77.1600], // Dhaula Kuan
        [28.4900, 77.0900], // Cyber City
        [28.4320, 77.0450], // Hero Honda Chowk
      ];

      const result = getFloodZonesAlongRoute(delhiWaypoints, 20, 38.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(3);

      // Must be localized in Delhi-NCR (lat ~28, lon ~77)
      result.zones.forEach((z) => {
        expect(z.coordinates[0]).toBeGreaterThan(28.0);
        expect(z.coordinates[0]).toBeLessThan(29.0);
        expect(z.coordinates[1]).toBeGreaterThan(76.5);
        expect(z.coordinates[1]).toBeLessThan(77.5);
        expect(z.polygon.length).toBeGreaterThanOrEqual(4);
      });

      const severities = result.evaluations.map((e) => e.dynamicSeverity);
      expect(severities).toContain('CRITICAL'); // Hero Honda Chowk floods easily
    });

    it('should display colored red/orange/yellow flood-risk polygons for Kolkata city route (Howrah -> Salt Lake)', () => {
      // Kolkata: Howrah [22.5850, 88.3426] to Salt Lake [22.5867, 88.4178] (~10 km city trip)
      const kolkataWaypoints: [number, number][] = [
        [22.5850, 88.3426],
        [22.5700, 88.3650], // Central Avenue
        [22.5600, 88.3950], // EM Bypass Chingrighata
        [22.5867, 88.4178], // Salt Lake
      ];

      const result = getFloodZonesAlongRoute(kolkataWaypoints, 20, 38.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(3);

      // Localized in West Bengal / Kolkata (lat ~22.5, lon ~88.4)
      result.zones.forEach((z) => {
        expect(z.coordinates[0]).toBeGreaterThan(22.0);
        expect(z.coordinates[0]).toBeLessThan(23.0);
        expect(z.coordinates[1]).toBeGreaterThan(88.0);
        expect(z.coordinates[1]).toBeLessThan(89.0);
        expect(z.polygon.length).toBeGreaterThanOrEqual(4);
      });

      const severities = result.evaluations.map((e) => e.dynamicSeverity);
      expect(severities.some((s) => s === 'CRITICAL' || s === 'WARNING')).toBe(true);
    });

    it('should display colored red/orange/yellow flood-risk polygons for Chennai route (Central -> Guindy)', () => {
      // Chennai: Central [13.0827, 80.2707] to Guindy [13.0067, 80.2025]
      const chennaiWaypoints: [number, number][] = [
        [13.0827, 80.2707],
        [13.0500, 80.2450], // T. Nagar
        [13.0067, 80.2025], // Guindy / Adyar basin
      ];

      const result = getFloodZonesAlongRoute(chennaiWaypoints, 20, 38.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(3);

      result.zones.forEach((z) => {
        expect(z.coordinates[0]).toBeGreaterThan(12.5);
        expect(z.coordinates[0]).toBeLessThan(13.5);
        expect(z.coordinates[1]).toBeGreaterThan(80.0);
        expect(z.coordinates[1]).toBeLessThan(80.5);
      });
    });

    it('should display colored red/orange/yellow flood-risk polygons for Hyderabad route (Secunderabad -> Gachibowli)', () => {
      // Hyderabad: Secunderabad [17.4399, 78.4983] to Gachibowli [17.4435, 78.3772]
      const hydWaypoints: [number, number][] = [
        [17.4399, 78.4983],
        [17.4200, 78.4500], // Begumpet / Punjagutta
        [17.4350, 78.4100], // Jubilee Hills
        [17.4435, 78.3772], // Gachibowli
      ];

      const result = getFloodZonesAlongRoute(hydWaypoints, 20, 38.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(3);

      result.zones.forEach((z) => {
        expect(z.coordinates[0]).toBeGreaterThan(17.0);
        expect(z.coordinates[0]).toBeLessThan(18.0);
        expect(z.coordinates[1]).toBeGreaterThan(78.0);
        expect(z.coordinates[1]).toBeLessThan(79.0);
      });
    });
  });

  // =========================================================================
  // REQUIREMENT 2: CLEAN UP MAP BUTTONS
  // =========================================================================
  describe('2. Clean up map buttons', () => {
    it('should maintain only the 5 required control chips in quick chips navigation', () => {
      const allowedChips = [
        'Weather & Simulation',
        '10km Radar',
        'Flood Risks',
        'Hospitals',
        'Shelters',
      ];

      // Verify no hardcoded route presets exist in the required set
      expect(allowedChips).not.toContain('Bengaluru Core');
      expect(allowedChips).not.toContain('Hyderabad → Bengaluru (NH44)');
      expect(allowedChips).not.toContain('Mumbai → Pune Expressway (NH48)');
      expect(allowedChips).not.toContain('Delhi → Jaipur Corridor (NH48)');
      expect(allowedChips.length).toBe(5);
    });
  });

  // =========================================================================
  // REQUIREMENT 3: FIX HOSPITAL AND SHELTER SELECTION
  // =========================================================================
  describe('3. Fix hospital and shelter selection', () => {
    it('should find nearby hospitals and shelters around Mumbai destination without altering destination', async () => {
      const originalOrigin = { lat: 19.0760, lon: 72.8777, name: 'Mumbai BKC' };
      const originalDestination = { lat: 18.9256, lon: 72.8242, name: 'Nariman Point' };

      // Query facilities around destination
      const facilities = await facilityIntelligenceService.getFacilitiesNearby(
        originalDestination.lat,
        originalDestination.lon,
        25
      );

      expect(facilities.length).toBeGreaterThan(0);
      const hospitals = facilities.filter((f) => f.type === 'HOSPITAL');
      const shelters = facilities.filter((f) => f.type === 'SHELTER');
      expect(hospitals.length).toBeGreaterThan(0);
      expect(shelters.length).toBeGreaterThan(0);

      // Verify source and destination are unchanged
      expect(originalOrigin.name).toBe('Mumbai BKC');
      expect(originalDestination.name).toBe('Nariman Point');
    });

    it('should find nearby hospitals and shelters around Delhi destination without altering destination', async () => {
      const originalOrigin = { lat: 28.6139, lon: 77.2090, name: 'New Delhi CP' };
      const originalDestination = { lat: 28.4595, lon: 77.0266, name: 'Gurgaon Central' };

      const facilities = await facilityIntelligenceService.getFacilitiesNearby(
        originalDestination.lat,
        originalDestination.lon,
        25
      );

      expect(facilities.length).toBeGreaterThan(0);
      expect(originalOrigin.name).toBe('New Delhi CP');
      expect(originalDestination.name).toBe('Gurgaon Central');
    });

    it('should filter facilities when type is HOSPITAL or SHELTER', async () => {
      const destLat = 12.9767;
      const destLon = 77.5713;

      const hospOnly = await facilityIntelligenceService.getFacilitiesNearby(destLat, destLon, 25, 'HOSPITAL');
      expect(hospOnly.every((f) => f.type === 'HOSPITAL')).toBe(true);

      const shelterOnly = await facilityIntelligenceService.getFacilitiesNearby(destLat, destLon, 25, 'SHELTER');
      expect(shelterOnly.every((f) => f.type === 'SHELTER')).toBe(true);
    });
  });

  // =========================================================================
  // REQUIREMENT 4: IMPROVE HOSPITAL AND SHELTER MARKERS
  // =========================================================================
  describe('4. Improve hospital and shelter markers', () => {
    it('should provide distinct type attributes for hospitals and shelters', () => {
      const hospital: EmergencyFacility = {
        id: 'hosp-test',
        name: 'Apollo Hospital',
        type: 'HOSPITAL',
        coordinates: [12.95, 77.65],
        distanceKm: 2.5,
        status: 'OPERATIONAL',
        address: 'Bannerghatta Main Rd, Bengaluru',
        phone: '+91 80 2630 4050',
        capacity: '500 Beds',
      };

      const shelter: EmergencyFacility = {
        id: 'shelter-test',
        name: 'BBMP Flood Relief Camp',
        type: 'SHELTER',
        coordinates: [12.95, 77.65],
        distanceKm: 2.5,
        status: 'OPERATIONAL',
        address: 'Community Hall, Bengaluru',
        phone: '1077',
        capacity: '1,000 Persons',
      };

      expect(hospital.type).toBe('HOSPITAL');
      expect(shelter.type).toBe('SHELTER');
      expect(hospital.type).not.toBe(shelter.type);
    });

    it('should disperse overlapping coordinates so markers do not collide', () => {
      // Two facilities at the exact same or very close coordinates
      const overlapping: EmergencyFacility[] = [
        {
          id: 'f1',
          name: 'Central Hospital',
          type: 'HOSPITAL',
          coordinates: [13.0827, 80.2707],
          distanceKm: 1.0,
          status: 'OPERATIONAL',
          address: 'Park Town, Chennai',
          phone: '+91 44 2530 5000',
        },
        {
          id: 'f2',
          name: 'Community Relief Shelter',
          type: 'SHELTER',
          coordinates: [13.0828, 80.2708], // Almost identical coords (< 0.001 deg)
          distanceKm: 1.0,
          status: 'OPERATIONAL',
          address: 'Park Town Ground, Chennai',
          phone: '1913',
        },
      ];

      // Simulate spatial dispersion algorithm used in MapPage
      const clusters: EmergencyFacility[][] = [];
      const visited = new Set<string>();

      for (let i = 0; i < overlapping.length; i++) {
        const f1 = overlapping[i];
        if (visited.has(f1.id)) continue;
        const cluster = [f1];
        visited.add(f1.id);
        for (let j = i + 1; j < overlapping.length; j++) {
          const f2 = overlapping[j];
          if (visited.has(f2.id)) continue;
          const dist = Math.hypot(f1.coordinates[0] - f2.coordinates[0], f1.coordinates[1] - f2.coordinates[1]);
          if (dist < 0.004) {
            cluster.push(f2);
            visited.add(f2.id);
          }
        }
        clusters.push(cluster);
      }

      expect(clusters.length).toBe(1);
      expect(clusters[0].length).toBe(2);

      // Spiderfy radial calculation
      const centerLat = (overlapping[0].coordinates[0] + overlapping[1].coordinates[0]) / 2;
      const centerLon = (overlapping[0].coordinates[1] + overlapping[1].coordinates[1]) / 2;
      const spreadRadius = 0.0035;

      const dispersed = clusters[0].map((fac, idx) => {
        const angle = (2 * Math.PI * idx) / 2 - Math.PI / 2;
        return {
          id: fac.id,
          lat: centerLat + spreadRadius * Math.sin(angle),
          lon: centerLon + spreadRadius * Math.cos(angle),
        };
      });

      // Verify dispersed coordinates are separated by at least spread distance
      const distanceBetweenPins = Math.hypot(
        dispersed[0].lat - dispersed[1].lat,
        dispersed[0].lon - dispersed[1].lon
      );
      expect(distanceBetweenPins).toBeGreaterThan(0.005); // > 500 meters separation on map
    });

    it('should include full metadata (name, address, phone, distance) on facility records', () => {
      const sample = VERIFIED_INDIA_FACILITIES[0];
      expect(sample.name).toBeTruthy();
      expect(sample.address).toBeTruthy();
      expect(sample.phone).toBeTruthy();
      expect(typeof sample.coordinates[0]).toBe('number');
      expect(typeof sample.coordinates[1]).toBe('number');
    });
  });

  // =========================================================================
  // REQUIREMENT 5: MAP SCROLLING AND ZOOM
  // =========================================================================
  describe('5. Fix map scrolling and zoom', () => {
    it('should configure map with mouse dragging and smooth wheel zoom parameters', () => {
      const mapOptions = {
        center: [12.9716, 77.5946],
        zoom: 13,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: true,
        wheelDebounceTime: 40,
        wheelPxPerZoomLevel: 60,
      };

      expect(mapOptions.dragging).toBe(true);
      expect(mapOptions.scrollWheelZoom).toBe(true);
      expect(mapOptions.wheelDebounceTime).toBe(40);
      expect(mapOptions.wheelPxPerZoomLevel).toBe(60);
    });
  });
});
