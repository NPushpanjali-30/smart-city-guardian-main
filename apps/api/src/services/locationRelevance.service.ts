import fs from 'fs';
import path from 'path';
import {
  FloodSeverity,
  LanguageCode,
  LocationAlertStatus,
  DestinationRiskEvaluation,
  LocationRelevanceEvaluation,
  SavedLocation,
  SavedLocationType,
  formatLocalizedAlert,
} from '@smartcity/shared';
import { config } from '../config/index.js';
import { MapAdapter } from '../providers/maps/mapAdapter.js';
import { dataAggregator } from './dataAggregator.js';
import { resolveMockPath } from '../utils/mockPath.js';
import { logger } from '../utils/logger.js';

interface RawFloodZone {
  zoneId: string;
  zoneName: string;
  severity: FloodSeverity;
  waterDepthCm: number;
  polygon: [number, number][]; // [[lon, lat], ...]
}

interface AlertHistoryRecord {
  userId: string;
  eventId: string;
  alertType: 'LOCATION_ALERT' | 'DESTINATION_ALERT';
  severity: FloodSeverity;
  severityRank: number;
  lastTriggeredAt: number;
}

const SEVERITY_RANKS: Record<FloodSeverity, number> = {
  NORMAL: 0,
  WATCH: 1,
  WARNING: 2,
  CRITICAL: 3,
};

const BENGALURU_FLOOD_ZONES_DATA = [
  {
    zoneId: 'zone-bellandur-basin-04',
    zoneName: 'Bellandur EcoSpace Catchment Basin',
    severity: 'CRITICAL' as FloodSeverity,
    centerLat: 12.9260,
    centerLon: 77.6762,
    waterDepthCm: 35.0,
  },
  {
    zoneId: 'zone-silk-board-06',
    zoneName: 'Silk Board Junction & Koramangala SWD',
    severity: 'CRITICAL' as FloodSeverity,
    centerLat: 12.9172,
    centerLon: 77.6228,
    waterDepthCm: 30.0,
  },
  {
    zoneId: 'zone-rainbow-drive-05',
    zoneName: 'Rainbow Drive Layout & Carmelaram Lowlands',
    severity: 'CRITICAL' as FloodSeverity,
    centerLat: 12.9080,
    centerLon: 77.7050,
    waterDepthCm: 42.0,
  },
  {
    zoneId: 'zone-marathahalli-rub-07',
    zoneName: 'Marathahalli Multiplex & Munnekolala RUB',
    severity: 'CRITICAL' as FloodSeverity,
    centerLat: 12.9540,
    centerLon: 77.7020,
    waterDepthCm: 32.0,
  },
  {
    zoneId: 'zone-hebbal-manyata-08',
    zoneName: 'Hebbal Lake & Manyata Tech Park Underpass',
    severity: 'WARNING' as FloodSeverity,
    centerLat: 13.0450,
    centerLon: 77.6150,
    waterDepthCm: 26.0,
  },
  {
    zoneId: 'zone-varthur-basin-09',
    zoneName: 'Varthur Lake & Balagere Lowlands',
    severity: 'WARNING' as FloodSeverity,
    centerLat: 12.9400,
    centerLon: 77.7400,
    waterDepthCm: 22.0,
  },
  {
    zoneId: 'zone-btm-madiwala-10',
    zoneName: 'BTM Layout 2nd Stage & Madiwala Lake Inlet',
    severity: 'WARNING' as FloodSeverity,
    centerLat: 12.9150,
    centerLon: 77.6100,
    waterDepthCm: 20.0,
  },
  {
    zoneId: 'zone-electronic-city-11',
    zoneName: 'Electronic City Phase 1 & Veerasandra Basin',
    severity: 'WARNING' as FloodSeverity,
    centerLat: 12.8480,
    centerLon: 77.6650,
    waterDepthCm: 24.0,
  },
  {
    zoneId: 'zone-hennur-hrbr-12',
    zoneName: 'Hennur / Kalyan Nagar HRBR Stormwater Confluence',
    severity: 'WATCH' as FloodSeverity,
    centerLat: 13.0180,
    centerLon: 77.6450,
    waterDepthCm: 15.0,
  },
  {
    zoneId: 'zone-kengeri-vrishabhavathi-13',
    zoneName: 'Kengeri Satellite Town & Vrishabhavathi Basin',
    severity: 'WATCH' as FloodSeverity,
    centerLat: 12.9150,
    centerLon: 77.4850,
    waterDepthCm: 18.0,
  },
];

export class LocationRelevanceService {
  private mapAdapter: MapAdapter;
  private alertHistory: Map<string, AlertHistoryRecord> = new Map();
  private userSavedLocations: Map<string, SavedLocation[]> = new Map();
  private alertCooldownMs = 60 * 60 * 1000; // 60 minutes cooldown for identical severity

  constructor() {
    this.mapAdapter = new MapAdapter();
    this.initializeDefaultSavedLocations();
  }

  private initializeDefaultSavedLocations(): void {
    const defaultLocations: SavedLocation[] = [
      {
        id: 'loc-home-01',
        userId: 'demo-user-1',
        name: 'Home',
        type: 'HOME',
        latitude: 40.7450,
        longitude: -74.0200,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'loc-work-02',
        userId: 'demo-user-1',
        name: 'Workplace Plaza',
        type: 'WORK',
        latitude: 40.7320,
        longitude: -74.0050,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'loc-hospital-03',
        userId: 'demo-user-1',
        name: 'City Memorial Hospital',
        type: 'HOSPITAL',
        latitude: 40.7140,
        longitude: -74.0120,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'loc-college-04',
        userId: 'demo-user-1',
        name: 'Metro State University',
        type: 'COLLEGE',
        latitude: 40.7250,
        longitude: -73.9920,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.userSavedLocations.set('demo-user-1', defaultLocations);
  }

  /**
   * Accurate spherical distance in kilometers using the Haversine formula
   */
  public calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  /**
   * Distance in meters between two coordinate pairs
   */
  public calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return Math.round(this.calculateDistance(lat1, lon1, lat2, lon2) * 1000);
  }

  /**
   * Location update throttling policy:
   * Returns true if time interval exceeded OR meaningful movement threshold met.
   */
  public shouldUpdateLocation(
    lastLat: number,
    lastLon: number,
    lastTimestampMs: number,
    newLat: number,
    newLon: number,
    newTimestampMs = Date.now()
  ): boolean {
    const intervalSeconds = config.LOCATION_UPDATE_INTERVAL_SECONDS;
    const minMeters = config.LOCATION_MIN_MOVEMENT_METERS;

    const timeDeltaSeconds = Math.abs(newTimestampMs - lastTimestampMs) / 1000;
    if (timeDeltaSeconds >= intervalSeconds) {
      return true;
    }

    const distanceMovedMeters = this.calculateDistanceMeters(lastLat, lastLon, newLat, newLon);
    return distanceMovedMeters >= minMeters;
  }

  /**
   * Retrieves active flood hazard zones from memory or mock files
   */
  public getActiveFloodZones(): Array<{
    zoneId: string;
    zoneName: string;
    severity: FloodSeverity;
    centerLat: number;
    centerLon: number;
    waterDepthCm: number;
  }> {
    const list: Array<{
      zoneId: string;
      zoneName: string;
      severity: FloodSeverity;
      centerLat: number;
      centerLon: number;
      waterDepthCm: number;
    }> = [];

    try {
      const mockPath = resolveMockPath('mock/flood.json');
      if (fs.existsSync(mockPath)) {
        const data = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
        const zones: RawFloodZone[] = data.zones || [];
        zones.forEach((z) => {
          const pts = (z.polygon.length > 1 && z.polygon[0][0] === z.polygon[z.polygon.length - 1][0] && z.polygon[0][1] === z.polygon[z.polygon.length - 1][1])
            ? z.polygon.slice(0, -1)
            : z.polygon;
          let latSum = 0;
          let lonSum = 0;
          pts.forEach(([lon, lat]) => {
            latSum += lat;
            lonSum += lon;
          });
          const count = pts.length || 1;
          list.push({
            zoneId: z.zoneId,
            zoneName: z.zoneName,
            severity: z.severity,
            centerLat: Number((latSum / count).toFixed(4)),
            centerLon: Number((lonSum / count).toFixed(4)),
            waterDepthCm: z.waterDepthCm,
          });
        });
      }
    } catch {
      // fallback
    }

    if (list.length === 0) {
      list.push(
        {
          zoneId: 'zone-bay-basin-01',
          zoneName: 'Bay Basin Lowlands',
          severity: 'CRITICAL',
          centerLat: 40.7150,
          centerLon: -74.0100,
          waterDepthCm: 28.0,
        },
        {
          zoneId: 'zone-river-corridor-03',
          zoneName: 'East River Concourse',
          severity: 'WARNING',
          centerLat: 40.7200,
          centerLon: -73.9900,
          waterDepthCm: 14.5,
        }
      );
    }

    // Merge comprehensive Bangalore flood hotspots to support user location alerts anywhere in Bengaluru
    const existingIds = new Set(list.map((z) => z.zoneId));
    for (const bZone of BENGALURU_FLOOD_ZONES_DATA) {
      if (!existingIds.has(bZone.zoneId)) {
        list.push(bZone);
      }
    }

    return list;
  }

  /**
   * Finds nearby active events within a configured radius
   */
  public findNearbyEvents(
    lat: number,
    lon: number,
    radiusKm: number = config.ALERT_RADIUS_KM
  ): LocationAlertStatus[] {
    const zones = this.getActiveFloodZones();
    const results: LocationAlertStatus[] = [];

    for (const zone of zones) {
      const dist = this.calculateDistance(lat, lon, zone.centerLat, zone.centerLon);
      const isWithinRadius = dist <= radiusKm;

      if (isWithinRadius && zone.severity !== 'NORMAL') {
        results.push({
          relevant: true,
          distanceKm: dist,
          severity: zone.severity,
          eventId: zone.zoneId,
          eventName: zone.zoneName,
          reason: `Active flood event (${zone.zoneName}, ${zone.waterDepthCm}cm) detected ${dist}km away`,
        });
      }
    }

    return results.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  /**
   * Evaluates current user location risk against active events
   */
  public checkCurrentLocation(
    lat: number,
    lon: number,
    radiusKm: number = config.ALERT_RADIUS_KM
  ): {
    coordinates: [number, number];
    risk: FloodSeverity;
    nearestEventDistanceKm: number;
    relevantEvents: LocationAlertStatus[];
    statusMessage: string;
  } {
    const nearby = this.findNearbyEvents(lat, lon, radiusKm);

    if (nearby.length === 0) {
      return {
        coordinates: [lat, lon],
        risk: 'NORMAL',
        nearestEventDistanceKm: 999.9,
        relevantEvents: [],
        statusMessage: `No active flood hazards detected within ${radiusKm}km radius`,
      };
    }

    // Determine highest severity
    let maxRank = 0;
    let highestSeverity: FloodSeverity = 'NORMAL';
    let nearestDist = 999.9;

    for (const event of nearby) {
      const rank = SEVERITY_RANKS[event.severity];
      if (rank > maxRank) {
        maxRank = rank;
        highestSeverity = event.severity;
      }
      if (event.distanceKm < nearestDist) {
        nearestDist = event.distanceKm;
      }
    }

    return {
      coordinates: [lat, lon],
      risk: highestSeverity,
      nearestEventDistanceKm: nearestDist,
      relevantEvents: nearby,
      statusMessage: `${highestSeverity} risk detected: ${nearby[0].eventName} is ${nearestDist}km away`,
    };
  }

  /**
   * Evaluates destination-based risk and affected corridors
   */
  public async evaluateDestination(
    destinationQuery?: string,
    destinationCoords?: { latitude: number; longitude: number },
    radiusKm: number = config.ALERT_RADIUS_KM
  ): Promise<DestinationRiskEvaluation | undefined> {
    if (!destinationQuery && !destinationCoords) {
      return undefined;
    }

    let lat = destinationCoords?.latitude;
    let lon = destinationCoords?.longitude;
    let name = destinationQuery || 'Destination';

    if (lat === undefined || lon === undefined) {
      const geocoded = await this.mapAdapter.geocode(destinationQuery || 'Destination');
      lat = geocoded.latitude;
      lon = geocoded.longitude;
      name = geocoded.formattedAddress;
    }

    const nearbyEvents = this.findNearbyEvents(lat, lon, radiusKm);

    let risk: FloodSeverity = 'NORMAL';
    let nearestDist = 999.9;

    if (nearbyEvents.length > 0) {
      let maxRank = 0;
      for (const ev of nearbyEvents) {
        const rank = SEVERITY_RANKS[ev.severity];
        if (rank > maxRank) {
          maxRank = rank;
          risk = ev.severity;
        }
        if (ev.distanceKm < nearestDist) {
          nearestDist = ev.distanceKm;
        }
      }
    }

    const affectedRoads: string[] = [];
    if (risk === 'CRITICAL' || risk === 'WARNING') {
      affectedRoads.push('Bay Street Underpass', 'Harbor Boulevard Corridor');
    }

    let recommendedAction = 'Proceed with normal travel awareness.';
    if (risk === 'CRITICAL') {
      recommendedAction = 'Do not travel to this area. Corridors are submerged.';
    } else if (risk === 'WARNING') {
      recommendedAction = 'Check an alternative route before traveling. Corridors may be congested or waterlogged.';
    } else if (risk === 'WATCH') {
      recommendedAction = 'Allow extra travel time and monitor local conditions.';
    }

    return {
      destination: name,
      coordinates: [lat, lon],
      risk,
      nearestEventDistanceKm: nearestDist,
      nearbyEvents,
      affectedRoads,
      recommendedAction,
      reason:
        nearbyEvents.length > 0
          ? `Flood event detected ${nearestDist} km from destination (${nearbyEvents[0].eventName})`
          : 'No active flood events detected nearby destination',
    };
  }

  /**
   * Deduplication and severity escalation evaluator
   */
  public evaluateDeduplication(
    userId: string,
    eventId: string,
    alertType: 'LOCATION_ALERT' | 'DESTINATION_ALERT',
    newSeverity: FloodSeverity
  ): { shouldNotify: boolean; deduplicated: boolean; reason: string } {
    const key = `${userId}:${eventId}:${alertType}`;
    const previous = this.alertHistory.get(key);
    const now = Date.now();
    const newRank = SEVERITY_RANKS[newSeverity];

    if (!previous) {
      // First time alert
      this.alertHistory.set(key, {
        userId,
        eventId,
        alertType,
        severity: newSeverity,
        severityRank: newRank,
        lastTriggeredAt: now,
      });
      return {
        shouldNotify: newSeverity !== 'NORMAL',
        deduplicated: false,
        reason: 'Initial alert for this event',
      };
    }

    // Severity escalation: WATCH -> WARNING or WARNING -> CRITICAL
    if (newRank > previous.severityRank) {
      this.alertHistory.set(key, {
        userId,
        eventId,
        alertType,
        severity: newSeverity,
        severityRank: newRank,
        lastTriggeredAt: now,
      });
      return {
        shouldNotify: true,
        deduplicated: false,
        reason: `Severity escalated from ${previous.severity} to ${newSeverity}`,
      };
    }

    // Severity is identical or downgraded: enforce cooldown window
    const elapsedMs = now - previous.lastTriggeredAt;
    if (elapsedMs < this.alertCooldownMs) {
      return {
        shouldNotify: false,
        deduplicated: true,
        reason: `Suppressed duplicate alert: active cooldown (${Math.round((this.alertCooldownMs - elapsedMs) / 60000)}m remaining)`,
      };
    }

    // Cooldown expired
    this.alertHistory.set(key, {
      userId,
      eventId,
      alertType,
      severity: newSeverity,
      severityRank: newRank,
      lastTriggeredAt: now,
    });
    return {
      shouldNotify: newSeverity !== 'NORMAL',
      deduplicated: false,
      reason: 'Cooldown expired; refreshed alert dispatched',
    };
  }

  /**
   * Comprehensive Location & Destination Relevance Evaluation
   */
  public async evaluateLocationRelevance(params: {
    latitude: number;
    longitude: number;
    destination?: string;
    destinationCoordinates?: { latitude: number; longitude: number };
    userId?: string;
    language?: LanguageCode;
    radiusKm?: number;
  }): Promise<LocationRelevanceEvaluation> {
    const radius = params.radiusKm || config.ALERT_RADIUS_KM;
    const lang = params.language || config.DEFAULT_LANGUAGE;
    const userId = params.userId || 'anonymous-user';

    const current = this.checkCurrentLocation(params.latitude, params.longitude, radius);
    const destination = await this.evaluateDestination(params.destination, params.destinationCoordinates, radius);

    // Evaluate notification need
    let shouldNotify = false;
    let alertSeverity: FloodSeverity = 'NORMAL';
    let deduplicated = false;
    let notifReason = 'No active alerts triggered';
    let smsSummary = '';

    if (current.risk !== 'NORMAL' && current.relevantEvents.length > 0) {
      const topEvent = current.relevantEvents[0];
      const dedupResult = this.evaluateDeduplication(userId, topEvent.eventId || 'event-current', 'LOCATION_ALERT', current.risk);

      shouldNotify = dedupResult.shouldNotify;
      deduplicated = dedupResult.deduplicated;
      notifReason = dedupResult.reason;
      alertSeverity = current.risk;

      if (shouldNotify) {
        const localized = formatLocalizedAlert({
          language: lang,
          severity: current.risk,
          alertType: 'LOCATION_ALERT',
          distanceKm: current.nearestEventDistanceKm,
          eventName: topEvent.eventName,
        });
        smsSummary = localized.smsSummary;
      }
    } else if (destination && destination.risk !== 'NORMAL') {
      const topDestEvent = destination.nearbyEvents[0];
      const dedupResult = this.evaluateDeduplication(
        userId,
        topDestEvent?.eventId || 'event-dest',
        'DESTINATION_ALERT',
        destination.risk
      );

      shouldNotify = dedupResult.shouldNotify;
      deduplicated = dedupResult.deduplicated;
      notifReason = dedupResult.reason;
      alertSeverity = destination.risk;

      if (shouldNotify) {
        const localized = formatLocalizedAlert({
          language: lang,
          severity: destination.risk,
          alertType: 'DESTINATION_ALERT',
          distanceKm: destination.nearestEventDistanceKm,
          destination: destination.destination,
        });
        smsSummary = localized.smsSummary;
      }
    }

    return {
      currentLocation: current,
      destination,
      notifications: {
        shouldNotify,
        alertSeverity,
        deduplicated,
        reason: notifReason,
        smsSummary: smsSummary || undefined,
      },
    };
  }

  // Saved Locations Management
  public getSavedLocations(userId: string): SavedLocation[] {
    return this.userSavedLocations.get(userId) || [];
  }

  public findLocationById(locationId: string): SavedLocation | null {
    for (const list of this.userSavedLocations.values()) {
      const found = list.find((l) => l.id === locationId);
      if (found) return found;
    }
    return null;
  }

  public saveLocation(location: SavedLocation): SavedLocation {
    const list = this.getSavedLocations(location.userId);
    const existingIdx = list.findIndex((l) => l.id === location.id);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...location, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...location, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    this.userSavedLocations.set(location.userId, list);
    return location;
  }

  public deleteSavedLocation(userId: string, locationId: string): boolean {
    const list = this.getSavedLocations(userId);
    const filtered = list.filter((l) => l.id !== locationId);
    this.userSavedLocations.set(userId, filtered);
    return filtered.length < list.length;
  }
}

export const locationRelevanceService = new LocationRelevanceService();
