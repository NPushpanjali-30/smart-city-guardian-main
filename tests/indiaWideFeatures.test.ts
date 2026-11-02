import { describe, it, expect } from 'vitest';
import {
  HISTORICAL_FLOOD_ZONES,
  INDIA_CORRIDOR_FLOOD_ZONES,
  ALL_INDIA_FLOOD_ZONES,
  getFloodZonesAlongRoute,
  evaluateZoneUnderWeatherForecast,
  calculateHaversineDistanceKm,
} from '../apps/web/src/pages/historicalFloodMaps.js';
import { facilityIntelligenceService } from '../apps/api/src/services/facilities/facilityIntelligence.service.js';
import { TextBeeSmsAdapter } from '../apps/api/src/providers/sms/textBeeSmsAdapter.js';

describe('SmartCity Guardian - All-India Disaster Mobility Platform Features', () => {
  // =========================================================================
  // FEATURE 1: INDIA-WIDE FLOOD RISK VISUALIZATION
  // =========================================================================
  describe('1. India-wide Flood Risk Visualization', () => {
    it('should preserve original 10 Bengaluru historical flood zones without mutation', () => {
      expect(HISTORICAL_FLOOD_ZONES.length).toBe(10);
      const silkBoard = HISTORICAL_FLOOD_ZONES.find((z) => z.id === 'bengaluru-silk-board');
      const rainbowDrive = HISTORICAL_FLOOD_ZONES.find((z) => z.id === 'bengaluru-rainbow-drive');
      expect(silkBoard).toBeDefined();
      expect(rainbowDrive).toBeDefined();
    });

    it('should maintain comprehensive all-India flood zones dataset', () => {
      expect(INDIA_CORRIDOR_FLOOD_ZONES.length).toBeGreaterThanOrEqual(15);
      expect(ALL_INDIA_FLOOD_ZONES.length).toBe(
        HISTORICAL_FLOOD_ZONES.length + INDIA_CORRIDOR_FLOOD_ZONES.length
      );
    });

    it('should detect and visualize flood zones along Hyderabad – Bengaluru corridor (NH44)', () => {
      // Hyderabad [17.385, 78.486] -> Mahbubnagar [16.748, 77.986] -> Kurnool [15.828, 78.037] -> Anantapur [14.681, 77.600] -> Bengaluru [12.976, 77.571]
      const hydBlrWaypoints: [number, number][] = [
        [17.3850, 78.4867],
        [16.7488, 77.9863],
        [16.2400, 77.8200], // Krishna River Beechupally
        [15.8281, 78.0373], // Tungabhadra Kurnool
        [14.6819, 77.6006], // Anantapur
        [13.7850, 77.7950], // Bagepalli
        [12.9767, 77.5713], // Bengaluru
      ];

      const result = getFloodZonesAlongRoute(hydBlrWaypoints, 35, 42.5);
      expect(result.zones.length).toBeGreaterThanOrEqual(5);

      const zoneIds = result.zones.map((z) => z.id);
      expect(zoneIds).toContain('hyd-musi-river');
      expect(zoneIds).toContain('nh44-krishna-beechupally');
      expect(zoneIds).toContain('nh44-kurnool-tungabhadra');
      expect(zoneIds).toContain('nh44-anantapur-pandameru');
      expect(zoneIds).toContain('nh44-bagepalli-chitravathi');

      // Verify color polygon overlay classifications (RED: High/Critical, ORANGE: Warning, YELLOW: Watch)
      const severities = result.evaluations.map((e) => e.dynamicSeverity);
      expect(severities).toContain('CRITICAL'); // RED overlay
      expect(result.criticalCount).toBeGreaterThan(0);

      // Verify each polygon has >= 4 vertices
      result.zones.forEach((zone) => {
        expect(zone.polygon.length).toBeGreaterThanOrEqual(4);
      });
    });

    it('should detect and visualize flood zones along Mumbai – Pune corridor (Expressway / NH48)', () => {
      const mumPuneWaypoints: [number, number][] = [
        [19.0760, 72.8777], // Mumbai BKC
        [19.0650, 72.8750], // Mithi River Kurla
        [18.9950, 73.1150], // Panvel Gadhi
        [18.7620, 73.3850], // Bhor Ghat / Khandala
        [18.6280, 73.8100], // PCMC Pavana River
        [18.5204, 73.8567], // Pune Mula-Mutha
      ];

      const result = getFloodZonesAlongRoute(mumPuneWaypoints, 35, 40.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(5);

      const zoneIds = result.zones.map((z) => z.id);
      expect(zoneIds).toContain('mum-mithi-river');
      expect(zoneIds).toContain('mum-panvel-kalundre');
      expect(zoneIds).toContain('nh48-bhorghat-khandala');
      expect(zoneIds).toContain('pune-pcmc-pavana');
      expect(zoneIds).toContain('pune-mula-mutha');

      // Check Mithi River extreme classification
      const mithiEval = result.evaluations.find((e) => e.zone.id === 'mum-mithi-river')!;
      expect(mithiEval.dynamicSeverity).toBe('CRITICAL');
      expect(mithiEval.floodsVeryEasily).toBe(true);
      expect(mithiEval.operationalAccessibility).toBe('BLOCKED');
    });

    it('should detect and visualize flood zones along Delhi – Jaipur corridor (NH48)', () => {
      const delJaipurWaypoints: [number, number][] = [
        [28.6139, 77.2090], // Delhi CP
        [28.6720, 77.2350], // Yamuna Khadar
        [28.4320, 77.0450], // Hero Honda Chowk Underpass
        [28.2150, 76.7850], // Dharuhera Sahibi River
        [27.7080, 76.1950], // Kotputli Sabi River
        [26.8250, 75.7750], // Jaipur Dravyavati River
      ];

      const result = getFloodZonesAlongRoute(delJaipurWaypoints, 35, 38.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(5);

      const zoneIds = result.zones.map((z) => z.id);
      expect(zoneIds).toContain('del-yamuna-khadar');
      expect(zoneIds).toContain('del-gurugram-badshahpur');
      expect(zoneIds).toContain('nh48-dharuhera-sahibi');
      expect(zoneIds).toContain('nh48-kotputli-sabi');
      expect(zoneIds).toContain('jai-dravyavati-basin');

      // Verify Hero Honda Chowk underpass risk under torrential downpour
      const heroHondaEval = result.evaluations.find((e) => e.zone.id === 'del-gurugram-badshahpur')!;
      expect(heroHondaEval.dynamicSeverity).toBe('CRITICAL');
      expect(heroHondaEval.estimatedWaterDepthCm).toBeGreaterThanOrEqual(30);
    });

    it('should dynamically generate graded colored risk polygons along any arbitrary Indian route', () => {
      // Arbitrary custom route (e.g. Bhopal to Indore)
      const customWaypoints: [number, number][] = [
        [23.2599, 77.4126], // Bhopal
        [23.1000, 76.8500],
        [22.9500, 76.3500],
        [22.7196, 75.8577], // Indore
      ];

      const result = getFloodZonesAlongRoute(customWaypoints, 25, 36.0);
      expect(result.zones.length).toBeGreaterThanOrEqual(3);

      // Verify all 3 risk tiers exist (RED, ORANGE, YELLOW)
      const tiers = result.zones.map((z) => z.vulnerabilityLevel);
      expect(tiers).toContain('EXTREME');
      expect(tiers).toContain('HIGH');
      expect(tiers).toContain('MODERATE');
    });
  });

  // =========================================================================
  // FEATURE 2: INDIA-WIDE HOSPITALS AND SHELTERS
  // =========================================================================
  describe('2. India-wide Hospitals and Shelters', () => {
    it('should return verified hospitals and shelters along Hyderabad – Bengaluru corridor (NH44)', async () => {
      const hydBlrWaypoints: [number, number][] = [
        [17.3850, 78.4867], // Hyderabad
        [16.7488, 77.9863], // Mahbubnagar
        [15.8281, 78.0373], // Kurnool
        [14.6819, 77.6006], // Anantapur
        [12.9767, 77.5713], // Bengaluru
      ];

      const facilities = await facilityIntelligenceService.getFacilitiesAlongRoute(
        hydBlrWaypoints,
        25
      );

      expect(facilities.length).toBeGreaterThanOrEqual(8);

      const hospitals = facilities.filter((f) => f.type === 'HOSPITAL');
      const shelters = facilities.filter((f) => f.type === 'SHELTER');
      expect(hospitals.length).toBeGreaterThan(0);
      expect(shelters.length).toBeGreaterThan(0);

      // Check genuine Osm data: name, address, phone contact, bed capacity
      const osmaniaHosp = facilities.find((f) => f.name.includes('Osmania'));
      expect(osmaniaHosp).toBeDefined();
      expect(osmaniaHosp?.address).toBeDefined();
      expect(osmaniaHosp?.phone).toBeDefined();
      expect(osmaniaHosp?.capacity).toBeDefined();

      const kurnoolHosp = facilities.find((f) => f.name.includes('Kurnool'));
      expect(kurnoolHosp).toBeDefined();
      expect(kurnoolHosp?.address).toContain('Kurnool');
    });

    it('should return verified hospitals and shelters along Mumbai – Pune corridor (Expressway / NH48)', async () => {
      const mumPuneWaypoints: [number, number][] = [
        [19.0760, 72.8777], // Mumbai BKC
        [19.0430, 72.8610], // Sion
        [18.9894, 73.1175], // Panvel
        [18.7557, 73.4091], // Lonavala
        [18.6279, 73.8131], // Pimpri
        [18.5204, 73.8567], // Pune
      ];

      const facilities = await facilityIntelligenceService.getFacilitiesAlongRoute(
        mumPuneWaypoints,
        25
      );

      expect(facilities.length).toBeGreaterThanOrEqual(8);

      // Verify specific facilities along corridor
      const sionHosp = facilities.find((f) => f.name.includes('Sion') || f.name.includes('KEM'));
      const sassoonHosp = facilities.find((f) => f.name.includes('Sassoon'));
      const kurlaShelter = facilities.find((f) => f.id === 'fac-mum-shelter-01' || f.name.includes('Kurla'));

      expect(sionHosp).toBeDefined();
      expect(sassoonHosp).toBeDefined();
      expect(kurlaShelter).toBeDefined();
      expect(kurlaShelter?.type).toBe('SHELTER');
      expect(kurlaShelter?.capacity).toBeDefined();
    });

    it('should return verified hospitals and shelters along Delhi – Jaipur corridor (NH48)', async () => {
      const delJaipurWaypoints: [number, number][] = [
        [28.6139, 77.2090], // Delhi
        [28.4595, 77.0266], // Gurugram
        [28.1920, 76.6190], // Rewari
        [27.7045, 76.1970], // Kotputli
        [26.9124, 75.7873], // Jaipur
      ];

      const facilities = await facilityIntelligenceService.getFacilitiesAlongRoute(
        delJaipurWaypoints,
        25
      );

      expect(facilities.length).toBeGreaterThanOrEqual(8);

      const aiims = facilities.find((f) => f.name.includes('AIIMS'));
      const smsHosp = facilities.find((f) => f.name.includes('Sawai Man Singh'));
      const gurugramHosp = facilities.find((f) => f.name.includes('Medanta'));

      expect(aiims).toBeDefined();
      expect(smsHosp).toBeDefined();
      expect(gurugramHosp).toBeDefined();
      expect(aiims?.phone).toBeDefined();
      expect(smsHosp?.capacity).toBeDefined();
    });

    it('should support type filtering for HOSPITALS only and SHELTERS only', async () => {
      const pointLat = 17.3850;
      const pointLon = 78.4867;

      const hospitalsOnly = await facilityIntelligenceService.getFacilitiesNearby(
        pointLat,
        pointLon,
        35,
        'HOSPITAL'
      );
      expect(hospitalsOnly.length).toBeGreaterThan(0);
      hospitalsOnly.forEach((f) => expect(f.type).toBe('HOSPITAL'));

      const sheltersOnly = await facilityIntelligenceService.getFacilitiesNearby(
        pointLat,
        pointLon,
        35,
        'SHELTER'
      );
      expect(sheltersOnly.length).toBeGreaterThan(0);
      sheltersOnly.forEach((f) => expect(f.type).toBe('SHELTER'));
    });
  });

  // =========================================================================
  // FEATURE 3: TEXTBEE SMS INTEGRATION
  // =========================================================================
  describe('3. TextBee SMS Integration', () => {
    it('should initialize TextBeeSmsAdapter with proper gateway name and base URL', () => {
      const adapter = new TextBeeSmsAdapter('test_key_123', 'device_001', true);
      expect(adapter.name).toBe('textbee-adapter');
      expect(adapter.isLive).toBe(false); // safe test mode is active
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should safely simulate disaster alert dispatches without sending real SMS or billing', async () => {
      const adapter = new TextBeeSmsAdapter('test_api_key', 'test_device', true);

      const result = await adapter.sendSms({
        to: '+919876543210',
        message: '🚨 CRITICAL FLOOD ALERT: Musi River water levels rising. NH44 Moosarambagh detour active.',
        priority: 'HIGH',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('DELIVERED');
      expect(result.messageId).toMatch(/^tb_sim_/);
      expect(result.provider).toBe('textbee-adapter-test-mode');
      expect(result.segmentCount).toBeGreaterThanOrEqual(1);

      // Verify delivery status query
      const status = await adapter.getDeliveryStatus(result.messageId);
      expect(status).toBe('DELIVERED');
    });

    it('should correctly format and normalize Indian phone numbers to E.164 (+91)', async () => {
      const adapter = new TextBeeSmsAdapter('test_key', undefined, true);

      // Test with 10-digit number
      const res1 = await adapter.sendSms({
        to: '9845012345',
        message: 'Disaster warning test message',
      });
      expect(res1.success).toBe(true);

      // Test with leading 0
      const res2 = await adapter.sendSms({
        to: '09845012345',
        message: 'Disaster warning test message',
      });
      expect(res2.success).toBe(true);
    });

    it('should reject invalid recipient phone formats gracefully with error', async () => {
      const adapter = new TextBeeSmsAdapter('test_key', undefined, true);

      const invalidResult = await adapter.sendSms({
        to: '12345', // invalid phone
        message: 'Alert test',
      });

      expect(invalidResult.success).toBe(false);
      expect(invalidResult.status).toBe('FAILED');
      expect(invalidResult.error).toContain('INVALID_PHONE_NUMBER');
    });

    it('should accurately detect UCS-2 encoding for Hindi/Kannada/Telugu/Marathi text', async () => {
      const adapter = new TextBeeSmsAdapter('test_key', undefined, true);

      // Hindi alert payload
      const hindiResult = await adapter.sendSms({
        to: '+919876543210',
        message: 'बाढ़ चेतावनी: मूसी नदी का जलस्तर बढ़ रहा है। सुरक्षित मार्ग अपनाएं।',
      });

      expect(hindiResult.success).toBe(true);
      expect(hindiResult.encoding).toBe('UCS-2');
    });
  });
});
