import { describe, it, expect } from 'vitest';
import {
  parseCoordinateInput,
  BASEMAP_CONFIGS,
  calculateBangaloreTrafficDuration,
} from '../apps/web/src/pages/mapHelpers.js';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';

describe('High-Precision Routing & High-Quality Free Maps', () => {
  describe('1. Free High-Definition Map Basemaps', () => {
    it('should include OpenStreetMap as primary razor-sharp open cartography basemap', () => {
      const osm = BASEMAP_CONFIGS.OPENSTREETMAP;
      expect(osm).toBeDefined();
      expect(osm.name).toBe('OpenStreetMap');
      expect(osm.maxZoom).toBe(19);
      expect(osm.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      expect(osm.attribution).toContain('OpenStreetMap');
    });

    it('should include Esri Navigation as high-precision road network without API key watermark', () => {
      const streets = BASEMAP_CONFIGS.ESRI_STREETS;
      expect(streets).toBeDefined();
      expect(streets.name).toBe('Esri Navigation');
      expect(streets.maxZoom).toBe(19);
      expect(streets.url).toContain('World_Street_Map');
      expect(streets.url).not.toContain('cartocdn');
    });

    it('should include Satellite Hybrid with high-resolution aerial imagery and street overlays', () => {
      const satellite = BASEMAP_CONFIGS.ESRI_SATELLITE;
      expect(satellite).toBeDefined();
      expect(satellite.hasOverlay).toBe(true);
      expect(satellite.overlayUrl).toBeDefined();
      expect(satellite.url).toContain('World_Imagery');
    });

    it('should provide Cyber Dark, Positron Light, Humanitarian, and Topographic styles without unauthenticated watermarks', () => {
      expect(BASEMAP_CONFIGS.CARTO_DARK).toBeDefined();
      expect(BASEMAP_CONFIGS.CARTO_DARK.name).toBe('Cyber Dark');
      expect(BASEMAP_CONFIGS.CARTO_DARK.maxZoom).toBe(19);

      expect(BASEMAP_CONFIGS.CARTO_LIGHT).toBeDefined();
      expect(BASEMAP_CONFIGS.CARTO_LIGHT.name).toBe('Positron Light');
      expect(BASEMAP_CONFIGS.CARTO_LIGHT.maxZoom).toBe(19);

      const osmHot = BASEMAP_CONFIGS.OSM_HOT;
      expect(osmHot).toBeDefined();
      expect(osmHot.url).toContain('{s}.tile.openstreetmap.fr');
      expect(osmHot.subdomains).toEqual(['a', 'b']);
      expect(osmHot.attribution).toContain('OpenStreetMap');

      const voyager = BASEMAP_CONFIGS.CARTO_VOYAGER;
      expect(voyager).toBeDefined();
      expect(voyager.url).toBeDefined();

      const topo = BASEMAP_CONFIGS.ESRI_TOPO;
      expect(topo).toBeDefined();
      expect(topo.url).toContain('World_Topo_Map');
    });
  });

  describe('2. Custom Coordinate Parser', () => {
    it('should parse raw comma-separated coordinates', () => {
      const res = parseCoordinateInput('13.00481, 77.59901');
      expect(res).not.toBeNull();
      expect(res?.lat).toBe(13.00481);
      expect(res?.lon).toBe(77.59901);

      const intCoords = parseCoordinateInput('13, 77');
      expect(intCoords).not.toBeNull();
      expect(intCoords?.lat).toBe(13);
      expect(intCoords?.lon).toBe(77);
    });

    it('should parse coordinates with alternative delimiters (semicolon, space)', () => {
      const semi = parseCoordinateInput('13.00481; 77.59901');
      expect(semi).not.toBeNull();
      expect(semi?.lat).toBe(13.00481);
      expect(semi?.lon).toBe(77.59901);

      const space = parseCoordinateInput('13.00481 77.59901');
      expect(space).not.toBeNull();
      expect(space?.lat).toBe(13.00481);
      expect(space?.lon).toBe(77.59901);
    });

    it('should parse bracketed and parenthesized coordinate strings', () => {
      const bracket = parseCoordinateInput('[13.00481, 77.59901]');
      expect(bracket).not.toBeNull();
      expect(bracket?.lat).toBe(13.00481);
      expect(bracket?.lon).toBe(77.59901);

      const paren = parseCoordinateInput('(13.00481, 77.59901)');
      expect(paren).not.toBeNull();
      expect(paren?.lat).toBe(13.00481);
      expect(paren?.lon).toBe(77.59901);
    });

    it('should parse Bengaluru formatted coordinate strings and wider locations', () => {
      const bng = parseCoordinateInput('Bengaluru (13.00481, 77.59901)');
      expect(bng).not.toBeNull();
      expect(bng?.lat).toBe(13.00481);
      expect(bng?.lon).toBe(77.59901);
      expect(bng?.name).toContain('Bengaluru');

      const mumbai = parseCoordinateInput('19.0760, 72.8777');
      expect(mumbai).not.toBeNull();
      expect(mumbai?.lat).toBe(19.076);
      expect(mumbai?.lon).toBe(72.8777);
      expect(mumbai?.name).toContain('Location');
    });

    it('should parse negative coordinates properly', () => {
      const sydney = parseCoordinateInput('-33.8688, 151.2093');
      expect(sydney).not.toBeNull();
      expect(sydney?.lat).toBe(-33.8688);
      expect(sydney?.lon).toBe(151.2093);

      const southWest = parseCoordinateInput('-12.5, -77.2');
      expect(southWest).not.toBeNull();
      expect(southWest?.lat).toBe(-12.5);
      expect(southWest?.lon).toBe(-77.2);
    });

    it('should reject invalid or out-of-range coordinates', () => {
      expect(parseCoordinateInput('invalid text')).toBeNull();
      expect(parseCoordinateInput('95.000, 77.000')).toBeNull();
      expect(parseCoordinateInput('-95.000, 77.000')).toBeNull();
      expect(parseCoordinateInput('13.000, 195.000')).toBeNull();
      expect(parseCoordinateInput('13.000, -195.000')).toBeNull();
      expect(parseCoordinateInput('')).toBeNull();
      expect(parseCoordinateInput('   ')).toBeNull();
      expect(parseCoordinateInput(null as any)).toBeNull();
      expect(parseCoordinateInput(undefined as any)).toBeNull();
    });
  });

  describe('3. Accurate Point-to-Point Routing (No Arbitrary Detours)', () => {
    it('should route strictly between specified coordinates when the corridor is safe', async () => {
      const origin = { latitude: 12.9767, longitude: 77.5713, name: 'Majestic Station' };
      const destination = { latitude: 13.00481, longitude: 77.59901, name: 'Frazer Town / Bangalore Palace' };

      const result = await routingEngineService.calculateRoutes({
        origin,
        destination,
        preferences: { prioritizeSafety: true },
      });

      expect(result).toHaveProperty('recommendedRoute');
      const rec = result.recommendedRoute;

      // Recommended route must be safe
      expect(rec.isBlocked).toBe(false);
      expect(rec.status).toBe('SAFE_TO_PROCEED');

      // The route must start at origin and end at destination
      expect(rec.origin.latitude).toBe(origin.latitude);
      expect(rec.origin.longitude).toBe(origin.longitude);
      expect(rec.destination.latitude).toBe(destination.latitude);
      expect(rec.destination.longitude).toBe(destination.longitude);

      // It must NOT force an arbitrary detour to Old Airport Road / Manipal Hospital for north Bangalore trips
      expect(rec.name).not.toContain('Old Airport Road');
    });

    it('should only recommend detour when the corridor passes near an active flood zone', async () => {
      // Trip passing right across Bellandur EcoSpace ORR underpass (12.9260, 77.6762)
      const origin = { latitude: 12.9172, longitude: 77.6228, name: 'Silk Board' };
      const destination = { latitude: 12.9856, longitude: 77.7317, name: 'Whitefield' };

      const result = await routingEngineService.calculateRoutes({
        origin,
        destination,
        preferences: { prioritizeSafety: true },
      });

      expect(result).toHaveProperty('recommendedRoute');
      expect(result.recommendedRoute.isBlocked).toBe(false);

      // Candidate list must include the blocked direct path and safe detour
      const blocked = result.candidateRoutes.find((c) => c.isBlocked);
      expect(blocked).toBeDefined();
    });
  });

  describe('4. Bangalore Real-World Traffic Duration Calibration', () => {
    it('should calibrate 26.3 km cross-city trip from ~29 min raw OSRM to realistic ~68-78 min in daytime/peak Bangalore traffic', () => {
      // 26.3 km trip from Sahakar Nagar/Yelahanka (13.12301, 77.626) to Whitefield ITPL (12.9856, 77.7317)
      const waypoints: [number, number][] = [
        [13.12301, 77.6260],
        [13.0358, 77.6080], // Hebbal
        [13.0012, 77.6970], // KR Puram
        [12.9856, 77.7317], // Whitefield ITPL
      ];

      // Daytime (14:30 IST)
      const daytime = calculateBangaloreTrafficDuration(26.3, 1740, {
        routeCoordinates: waypoints,
        customIstHour: 14.5,
      });

      // Realistic travel time should be between 68 and 78 minutes (NOT 29 minutes!)
      expect(daytime.durationMinutes).toBeGreaterThanOrEqual(68);
      expect(daytime.durationMinutes).toBeLessThanOrEqual(78);
      expect(daytime.effectiveSpeedKmh).toBeGreaterThanOrEqual(20);
      expect(daytime.effectiveSpeedKmh).toBeLessThanOrEqual(25);
      expect(daytime.detectedChokepoints.length).toBeGreaterThan(0);

      // Peak hours (09:30 or 18:30 IST)
      const peak = calculateBangaloreTrafficDuration(26.3, 1740, {
        routeCoordinates: waypoints,
        customIstHour: 18.5,
      });
      expect(peak.durationMinutes).toBeGreaterThanOrEqual(68);
      expect(peak.durationMinutes).toBeLessThanOrEqual(85);
      expect(peak.isPeakHours).toBe(true);
    });

    it('should calibrate short urban trips (4.5 km, MG Road to Koramangala) within realistic ~16-22 min range', () => {
      // 4.5 km trip passing through Koramangala Sony World chokepoint
      const waypoints: [number, number][] = [
        [12.9756, 77.6066], // MG Road
        [12.9352, 77.6245], // Sony World Koramangala
      ];
      const daytime = calculateBangaloreTrafficDuration(4.5, 300, {
        routeCoordinates: waypoints,
        customIstHour: 14.5,
      });
      const peak = calculateBangaloreTrafficDuration(4.5, 300, {
        routeCoordinates: waypoints,
        customIstHour: 18.5,
      });

      // Realistic duration in Bangalore urban core is ~16-22 minutes (speeds ~14-20 km/h)
      expect(daytime.durationMinutes).toBeGreaterThanOrEqual(16);
      expect(daytime.durationMinutes).toBeLessThanOrEqual(22);
      expect(peak.durationMinutes).toBeGreaterThanOrEqual(16);
      expect(peak.durationMinutes).toBeLessThanOrEqual(22);
      expect(daytime.detectedChokepoints).toContain('Sony World Koramangala 80ft');
    });

    it('should calibrate intermediate trips (12 km, Indiranagar to Electronic City / Silk Board) within realistic ~38-48 min range', () => {
      // 12 km trip traversing Koramangala and Silk Board junction
      const waypoints: [number, number][] = [
        [12.9716, 77.6412], // Indiranagar
        [12.9352, 77.6245], // Koramangala
        [12.9172, 77.6228], // Silk Board
      ];
      const daytime = calculateBangaloreTrafficDuration(12.0, 720, {
        routeCoordinates: waypoints,
        customIstHour: 14.5,
      });
      const peak = calculateBangaloreTrafficDuration(12.0, 720, {
        routeCoordinates: waypoints,
        customIstHour: 18.5,
      });

      // Realistic travel time in Bangalore should be in the ~38-48 min range
      expect(daytime.durationMinutes).toBeGreaterThanOrEqual(38);
      expect(daytime.durationMinutes).toBeLessThanOrEqual(48);
      expect(peak.durationMinutes).toBeGreaterThanOrEqual(38);
      expect(peak.durationMinutes).toBeLessThanOrEqual(48);
      expect(daytime.detectedChokepoints).toContain('Silk Board Junction');
      expect(daytime.detectedChokepoints).toContain('Sony World Koramangala 80ft');
    });

    it('should calibrate short urban trips (< 5 km) with heavy stop-and-go speeds (14-22 km/h)', () => {
      const shortTrip = calculateBangaloreTrafficDuration(4.5, 300, {
        customIstHour: 14.5,
      });
      expect(shortTrip.durationMinutes).toBeGreaterThanOrEqual(13);
      expect(shortTrip.durationMinutes).toBeLessThanOrEqual(18);
      expect(shortTrip.effectiveSpeedKmh).toBeGreaterThanOrEqual(14);
      expect(shortTrip.effectiveSpeedKmh).toBeLessThanOrEqual(22);
    });

    it('should factor in waterlogging and flood risk delay multiplier', () => {
      const normal = calculateBangaloreTrafficDuration(15.0, 1000, {
        floodRisk: 0,
        customIstHour: 14.5,
      });
      const moderateFlood = calculateBangaloreTrafficDuration(15.0, 1000, {
        floodRisk: 25,
        customIstHour: 14.5,
      });
      const severeFlood = calculateBangaloreTrafficDuration(15.0, 1000, {
        floodRisk: 65,
        customIstHour: 14.5,
      });

      expect(moderateFlood.durationMinutes).toBeGreaterThan(normal.durationMinutes);
      expect(severeFlood.durationMinutes).toBeGreaterThan(moderateFlood.durationMinutes);
      // Verify expected ranges based on +15% and +30% waterlogging penalties
      expect(moderateFlood.durationMinutes).toBe(40);
      expect(severeFlood.durationMinutes).toBe(45);
    });

    it('should apply peak vs off-peak hour multipliers correctly across IST schedule', () => {
      const offPeak = calculateBangaloreTrafficDuration(20.0, 1200, { customIstHour: 2.0 });
      const normalDay = calculateBangaloreTrafficDuration(20.0, 1200, { customIstHour: 14.0 });
      const peakMorning = calculateBangaloreTrafficDuration(20.0, 1200, { customIstHour: 9.5 });
      const peakEvening = calculateBangaloreTrafficDuration(20.0, 1200, { customIstHour: 18.5 });

      expect(peakMorning.isPeakHours).toBe(true);
      expect(peakEvening.isPeakHours).toBe(true);
      expect(offPeak.isPeakHours).toBe(false);
      expect(normalDay.isPeakHours).toBe(false);

      expect(peakMorning.timeMultiplier).toBe(1.15);
      expect(peakEvening.timeMultiplier).toBe(1.15);
      expect(normalDay.timeMultiplier).toBe(1.04);
      expect(offPeak.timeMultiplier).toBe(0.85);

      expect(peakMorning.durationMinutes).toBeGreaterThan(normalDay.durationMinutes);
      expect(normalDay.durationMinutes).toBeGreaterThan(offPeak.durationMinutes);
    });
  });
});
