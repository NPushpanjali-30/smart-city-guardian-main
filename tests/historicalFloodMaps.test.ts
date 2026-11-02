import { describe, it, expect } from 'vitest';
import {
  HISTORICAL_FLOOD_ZONES,
  DEFAULT_WEATHER_FORECAST,
  evaluateZoneUnderWeatherForecast,
  evaluateAllHistoricalZones,
  calculateHaversineDistanceKm,
  calculateBearingText,
  evaluateUserProximityAlerts,
} from '../apps/web/src/pages/historicalFloodMaps.js';

describe('Historical Flood Maps & Forecast-Based Inundation Prediction', () => {
  describe('1. Historical Flood Hotspots Dataset Integrity (Old Flood Maps)', () => {
    it('should map out 10 major historical flood hotspots across Bengaluru with complete hydrological data', () => {
      expect(HISTORICAL_FLOOD_ZONES.length).toBe(10);

      HISTORICAL_FLOOD_ZONES.forEach((zone) => {
        expect(zone.id).toBeDefined();
        expect(zone.name).toBeDefined();
        expect(zone.locality).toBeDefined();
        expect(zone.coordinates).toHaveLength(2);
        expect(zone.polygon.length).toBeGreaterThanOrEqual(4);
        expect(zone.criticalRainfallThresholdMmh).toBeGreaterThan(0);
        expect(zone.elevationMeters).toBeGreaterThan(0);
        expect(zone.historicalNotes).toBeDefined();
        expect(zone.historicalNotes.length).toBeGreaterThan(20);
        expect(zone.affectedCorridors.length).toBeGreaterThan(0);
        expect(zone.safeAlternativeDetours.length).toBeGreaterThan(0);
      });
    });

    it('should correctly classify topographically vulnerable lowlands that flood very easily', () => {
      const rainbowDrive = HISTORICAL_FLOOD_ZONES.find((z) => z.id === 'bengaluru-rainbow-drive')!;
      const silkBoard = HISTORICAL_FLOOD_ZONES.find((z) => z.id === 'bengaluru-silk-board')!;
      const bellandur = HISTORICAL_FLOOD_ZONES.find((z) => z.id === 'bengaluru-bellandur-ecospace')!;
      const marathahalli = HISTORICAL_FLOOD_ZONES.find((z) => z.id === 'bengaluru-marathahalli-rub')!;

      expect(rainbowDrive).toBeDefined();
      expect(rainbowDrive.vulnerabilityLevel).toBe('EXTREME');
      expect(rainbowDrive.criticalRainfallThresholdMmh).toBe(14.0); // Floods at lowest rainfall threshold

      expect(silkBoard.vulnerabilityLevel).toBe('EXTREME');
      expect(silkBoard.criticalRainfallThresholdMmh).toBe(16.0);

      expect(bellandur.vulnerabilityLevel).toBe('EXTREME');
      expect(bellandur.criticalRainfallThresholdMmh).toBe(18.0);

      expect(marathahalli.vulnerabilityLevel).toBe('VERY_HIGH');
      expect(marathahalli.criticalRainfallThresholdMmh).toBe(15.0);
    });
  });

  describe('2. Weather Forecast Dynamic Flood Prediction', () => {
    it('should predict that lowlands flood very easily when weather forecast rain exceeds critical threshold', () => {
      const forecastRain = 42.5; // mm/h torrential rain
      const evaluation = evaluateAllHistoricalZones(forecastRain);

      expect(evaluation.floodsEasilyCount).toBeGreaterThanOrEqual(5);
      expect(evaluation.criticalCount).toBeGreaterThanOrEqual(5);

      const rainbowDriveEval = evaluation.evaluations.find((e) => e.zone.id === 'bengaluru-rainbow-drive')!;
      expect(rainbowDriveEval.floodsVeryEasily).toBe(true);
      expect(rainbowDriveEval.dynamicSeverity).toBe('CRITICAL');
      expect(rainbowDriveEval.operationalAccessibility).toBe('BLOCKED');
      expect(rainbowDriveEval.capacityUtilizationRatio).toBeGreaterThan(2.0); // > 200% capacity
      expect(rainbowDriveEval.estimatedWaterDepthCm).toBeGreaterThanOrEqual(35);

      const bellandurEval = evaluation.evaluations.find((e) => e.zone.id === 'bengaluru-bellandur-ecospace')!;
      expect(bellandurEval.floodsVeryEasily).toBe(true);
      expect(bellandurEval.dynamicSeverity).toBe('CRITICAL');
      expect(bellandurEval.operationalAccessibility).toBe('BLOCKED');
    });

    it('should project safe / manageable conditions when weather forecast rain is low', () => {
      const dryRain = 8.0; // mm/h light rain
      const evaluation = evaluateAllHistoricalZones(dryRain);

      expect(evaluation.floodsEasilyCount).toBe(0);
      expect(evaluation.criticalCount).toBe(0);

      evaluation.evaluations.forEach((e) => {
        expect(e.dynamicSeverity).not.toBe('CRITICAL');
        expect(e.operationalAccessibility).not.toBe('BLOCKED');
        expect(e.estimatedWaterDepthCm).toBeLessThan(15);
      });
    });

    it('should monotonically scale risk score and estimated depth with increasing forecast rainfall', () => {
      const zone = HISTORICAL_FLOOD_ZONES.find((z) => z.id === 'bengaluru-silk-board')!;

      const eval10 = evaluateZoneUnderWeatherForecast(zone, 10.0);
      const eval20 = evaluateZoneUnderWeatherForecast(zone, 20.0);
      const eval40 = evaluateZoneUnderWeatherForecast(zone, 40.0);

      expect(eval20.dynamicRiskScore).toBeGreaterThan(eval10.dynamicRiskScore);
      expect(eval40.dynamicRiskScore).toBeGreaterThan(eval20.dynamicRiskScore);

      expect(eval20.estimatedWaterDepthCm).toBeGreaterThanOrEqual(eval10.estimatedWaterDepthCm);
      expect(eval40.estimatedWaterDepthCm).toBeGreaterThan(eval20.estimatedWaterDepthCm);
    });

    it('should provide complete hourly forecast timeline and active flood warning bulletin', () => {
      expect(DEFAULT_WEATHER_FORECAST.timeline.length).toBeGreaterThanOrEqual(3);
      expect(DEFAULT_WEATHER_FORECAST.currentRainfallRateMmh).toBeGreaterThan(0);
      expect(DEFAULT_WEATHER_FORECAST.activeAlert).toBeDefined();
      expect(DEFAULT_WEATHER_FORECAST.activeAlert?.headline).toContain('Flood');
    });
  });

  describe('3. User Geolocation-Based 10km Proximity Alerts', () => {
    it('should accurately calculate Haversine distance and compass bearing between coordinates', () => {
      // Koramangala to Silk Board
      const koramangalaLat = 12.9352;
      const koramangalaLon = 77.6245;
      const silkBoardLat = 12.9172;
      const silkBoardLon = 77.6228;

      const distKm = calculateHaversineDistanceKm(koramangalaLat, koramangalaLon, silkBoardLat, silkBoardLon);
      expect(distKm).toBeGreaterThan(1.8);
      expect(distKm).toBeLessThan(2.2);

      const bearing = calculateBearingText(koramangalaLat, koramangalaLon, silkBoardLat, silkBoardLon);
      expect(['S', 'SW', 'SE']).toContain(bearing);
    });

    it('should generate proximity alerts strictly within 10 km of Koramangala user coordinates', () => {
      const koramangalaLat = 12.9352;
      const koramangalaLon = 77.6245;

      const { evaluations } = evaluateAllHistoricalZones(35.0); // 35 mm/h heavy rain
      const alerts = evaluateUserProximityAlerts(koramangalaLat, koramangalaLon, evaluations, 10);

      expect(alerts.userCoordinates.lat).toBe(koramangalaLat);
      expect(alerts.userCoordinates.lon).toBe(koramangalaLon);
      expect(alerts.radiusKm).toBe(10);
      expect(alerts.nearbyEvents.length).toBeGreaterThan(0);

      // Nearby hazards (Silk Board ~2.0 km, Bellandur ~5.7 km) MUST be included
      const hasSilkBoard = alerts.nearbyEvents.some((e) => e.evaluation.zone.id === 'bengaluru-silk-board');
      const hasBellandur = alerts.nearbyEvents.some((e) => e.evaluation.zone.id === 'bengaluru-bellandur-ecospace');
      expect(hasSilkBoard).toBe(true);
      expect(hasBellandur).toBe(true);

      // All nearby items must have distance <= 10 km
      alerts.nearbyEvents.forEach((item) => {
        expect(item.distanceKm).toBeLessThanOrEqual(10.0);
        expect(item.withinRadius).toBe(true);
      });

      // Distant hazards (> 10 km away like Hebbal ~12.2 km, Kengeri ~15.3 km) MUST be excluded from nearbyEvents
      const hasHebbal = alerts.nearbyEvents.some((e) => e.evaluation.zone.id === 'bengaluru-hebbal-manyata');
      const hasKengeri = alerts.nearbyEvents.some((e) => e.evaluation.zone.id === 'bengaluru-kengeri-vrishabhavathi');
      expect(hasHebbal).toBe(false);
      expect(hasKengeri).toBe(false);

      // Verify severity and nearest hazard
      expect(alerts.nearestHazard).toBeDefined();
      expect(alerts.nearestHazard?.evaluation.zone.id).toBe('bengaluru-silk-board');
      expect(alerts.nearestDistanceKm).toBeLessThanOrEqual(2.2);
      expect(alerts.highestSeverity).toBe('CRITICAL');
      expect(alerts.proximityScore).toBeGreaterThan(70);
      expect(alerts.statusMessage).toContain('CRITICAL FLOOD THREAT');
      expect(alerts.statusMessage).toContain('Silk Board');
    });

    it('should generate proximity alerts tailored to Yelahanka user, excluding South Bengaluru hazards', () => {
      // Yelahanka (Far North Bengaluru)
      const yelahankaLat = 13.0998;
      const yelahankaLon = 77.5963;

      const { evaluations } = evaluateAllHistoricalZones(30.0);
      const alerts = evaluateUserProximityAlerts(yelahankaLat, yelahankaLon, evaluations, 10);

      // Hebbal is ~7.2 km away from Yelahanka -> within 10 km
      const hasHebbal = alerts.nearbyEvents.some((e) => e.evaluation.zone.id === 'bengaluru-hebbal-manyata');
      expect(hasHebbal).toBe(true);

      // Silk Board and Bellandur are > 20 km away -> MUST be excluded
      const hasSilkBoard = alerts.nearbyEvents.some((e) => e.evaluation.zone.id === 'bengaluru-silk-board');
      const hasBellandur = alerts.nearbyEvents.some((e) => e.evaluation.zone.id === 'bengaluru-bellandur-ecospace');
      expect(hasSilkBoard).toBe(false);
      expect(hasBellandur).toBe(false);
    });

    it('should indicate CLEAR ZONE when user is in a location with no flood hazards within 10 km', () => {
      // Location far north near Devanahalli airport (~13.25, 77.71)
      const devanahalliLat = 13.2500;
      const devanahalliLon = 77.7100;

      const { evaluations } = evaluateAllHistoricalZones(20.0);
      const alerts = evaluateUserProximityAlerts(devanahalliLat, devanahalliLon, evaluations, 10);

      expect(alerts.nearbyEvents.length).toBe(0);
      expect(alerts.totalNearbyCount).toBe(0);
      expect(alerts.highestSeverity).toBe('NORMAL');
      expect(alerts.proximityScore).toBeLessThan(15);
      expect(alerts.statusMessage).toContain('CLEAR ZONE');
    });
  });
});
