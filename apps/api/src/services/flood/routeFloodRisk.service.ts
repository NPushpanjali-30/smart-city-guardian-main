import { logger } from '../../utils/logger.js';

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface RouteFloodSegment {
  segmentIndex: number;
  coordinates: [number, number]; // [lat, lon]
  startWaypointIndex: number;
  endWaypointIndex: number;
  severity: 'CRITICAL' | 'WARNING' | 'WATCH' | 'NORMAL';
  color: string;
  riskLabel: string;
  sourceType: 'Live observation' | 'Forecast' | 'Historical' | 'Simulated scenario';
  isUnavailable?: boolean;
  unavailableReason?: string;
  metrics: {
    riverDischargeM3s?: number;
    rainfallMmH?: number;
    waterDepthCm?: number;
  };
  description: string;
  recommendation: string;
}

export interface RouteFloodEvaluationResult {
  success: boolean;
  segments: RouteFloodSegment[];
  hasUnavailableSegments: boolean;
  summary: {
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    normalCount: number;
    unavailableCount: number;
    totalSegments: number;
  };
}

// Verified Bengaluru Historical Flood Reference Hotspots
const BENGALURU_HISTORICAL_HOTSPOTS = [
  { name: 'Bellandur Lake Basin & EcoSpace ORR', coords: [12.9260, 77.6762] as [number, number], threshold: 18.0, depth: 35 },
  { name: 'Silk Board Junction Underpass', coords: [12.9172, 77.6228] as [number, number], threshold: 15.0, depth: 28 },
  { name: 'Koramangala 80ft Road Lowland', coords: [12.9352, 77.6245] as [number, number], threshold: 22.0, depth: 18 },
  { name: 'Hebbal Flyover Service Basin', coords: [13.0358, 77.6080] as [number, number], threshold: 24.0, depth: 15 },
  { name: 'KR Puram Tin Factory Chokepoint', coords: [13.0012, 77.6970] as [number, number], threshold: 20.0, depth: 22 },
];

export class RouteFloodRiskService {
  private cache: Map<string, { timestamp: number; data: any }> = new Map();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 mins

  /**
   * Evaluates flood risk along an arbitrary route corridor across India
   * using real Open-Meteo GloFAS river discharge and Weather Forecast APIs.
   */
  public async evaluateRouteCorridor(
    waypoints: [number, number][],
    options?: { simulatedRainfall?: number; scenarioName?: string }
  ): Promise<RouteFloodEvaluationResult> {
    if (!waypoints || waypoints.length === 0) {
      return {
        success: true,
        segments: [],
        hasUnavailableSegments: false,
        summary: {
          highRiskCount: 0,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          normalCount: 0,
          unavailableCount: 0,
          totalSegments: 0,
        },
      };
    }

    // Sample 4 to 6 evenly spaced points along the route
    const sampleCount = Math.min(6, Math.max(3, Math.floor(waypoints.length / 5)));
    const sampledSegments: RouteFloodSegment[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const frac = sampleCount === 1 ? 0.5 : i / (sampleCount - 1);
      const wpIdx = Math.min(waypoints.length - 1, Math.floor(frac * (waypoints.length - 1)));
      const nextWpIdx = Math.min(waypoints.length - 1, Math.floor(((i + 1) / sampleCount) * (waypoints.length - 1)));
      const [lat, lon] = waypoints[wpIdx];

      const segment = await this.evaluateSinglePoint(
        lat,
        lon,
        i,
        wpIdx,
        nextWpIdx,
        options?.simulatedRainfall,
        options?.scenarioName
      );
      sampledSegments.push(segment);
    }

    const highCount = sampledSegments.filter((s) => s.severity === 'CRITICAL').length;
    const medCount = sampledSegments.filter((s) => s.severity === 'WARNING').length;
    const lowCount = sampledSegments.filter((s) => s.severity === 'WATCH').length;
    const normalCount = sampledSegments.filter((s) => s.severity === 'NORMAL' && !s.isUnavailable).length;
    const unavailableCount = sampledSegments.filter((s) => s.isUnavailable).length;

    return {
      success: true,
      segments: sampledSegments,
      hasUnavailableSegments: unavailableCount > 0,
      summary: {
        highRiskCount: highCount,
        mediumRiskCount: medCount,
        lowRiskCount: lowCount,
        normalCount,
        unavailableCount,
        totalSegments: sampledSegments.length,
      },
    };
  }

  private async evaluateSinglePoint(
    lat: number,
    lon: number,
    segmentIndex: number,
    startWpIdx: number,
    endWpIdx: number,
    simulatedRainfall?: number,
    scenarioName?: string
  ): Promise<RouteFloodSegment> {
    // 1. Check if user specified a simulated scenario
    if (typeof simulatedRainfall === 'number' && !isNaN(simulatedRainfall) && simulatedRainfall > 0) {
      let severity: 'CRITICAL' | 'WARNING' | 'WATCH' | 'NORMAL' = 'NORMAL';
      let color = '#10B981';
      let riskLabel = 'Minimal Risk';

      if (simulatedRainfall >= 35.0) {
        severity = 'CRITICAL';
        color = '#EF4444';
        riskLabel = 'High Risk';
      } else if (simulatedRainfall >= 20.0) {
        severity = 'WARNING';
        color = '#F97316';
        riskLabel = 'Medium Risk';
      } else if (simulatedRainfall >= 8.0) {
        severity = 'WATCH';
        color = '#F59E0B';
        riskLabel = 'Low Risk';
      }

      return {
        segmentIndex,
        coordinates: [lat, lon],
        startWaypointIndex: startWpIdx,
        endWaypointIndex: endWpIdx,
        severity,
        color,
        riskLabel,
        sourceType: 'Simulated scenario',
        metrics: {
          rainfallMmH: simulatedRainfall,
          waterDepthCm: Math.round(simulatedRainfall * 0.8),
        },
        description: `Simulated rainfall stress test (${scenarioName || 'Custom'}): ${simulatedRainfall.toFixed(1)} mm/h injected`,
        recommendation: severity === 'CRITICAL' ? 'Mandatory detour around low-lying underpasses' : 'Proceed with caution',
      };
    }

    // 2. Check for nearby verified Bengaluru historical hotspot (< 2.5 km)
    for (const spot of BENGALURU_HISTORICAL_HOTSPOTS) {
      const distKm = haversineDistanceKm(lat, lon, spot.coords[0], spot.coords[1]);
      if (distKm <= 2.5) {
        return {
          segmentIndex,
          coordinates: [lat, lon],
          startWaypointIndex: startWpIdx,
          endWaypointIndex: endWpIdx,
          severity: 'CRITICAL',
          color: '#EF4444',
          riskLabel: 'High Risk',
          sourceType: 'Historical',
          metrics: {
            rainfallMmH: spot.threshold,
            waterDepthCm: spot.depth,
          },
          description: `Verified historical flood hotspot: ${spot.name} (drainage overflow record)`,
          recommendation: 'Use elevated detour corridor',
        };
      }
    }

    // 3. Query Real Open-Meteo GloFAS River Discharge & Forecast Rainfall
    const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return {
        segmentIndex,
        startWaypointIndex: startWpIdx,
        endWaypointIndex: endWpIdx,
        ...cached.data,
      };
    }

    let dischargeM3s: number | undefined;
    let rainfallMmH: number | undefined;
    let hasLiveDischarge = false;
    let isDataAvailable = false;

    // Fetch River Discharge (GloFAS)
    try {
      const floodUrl = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=river_discharge_max&forecast_days=1`;
      const res = await fetch(floodUrl, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const dischargeList = json?.daily?.river_discharge_max;
        if (Array.isArray(dischargeList) && dischargeList.length > 0 && typeof dischargeList[0] === 'number') {
          dischargeM3s = dischargeList[0];
          hasLiveDischarge = true;
          isDataAvailable = true;
        }
      }
    } catch {
      // Non-fatal, fallback to weather forecast
    }

    // Fetch Weather Forecast (Precipitation)
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=precipitation,rain&forecast_days=1`;
      const res = await fetch(weatherUrl, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const currentRain = json?.current?.precipitation ?? json?.current?.rain;
        if (typeof currentRain === 'number') {
          rainfallMmH = currentRain;
          isDataAvailable = true;
        }
      }
    } catch {
      // Non-fatal
    }

    // If both APIs failed or returned no data:
    if (!isDataAvailable) {
      const unavailableSegment: RouteFloodSegment = {
        segmentIndex,
        coordinates: [lat, lon],
        startWaypointIndex: startWpIdx,
        endWaypointIndex: endWpIdx,
        severity: 'NORMAL',
        color: '#64748B',
        riskLabel: 'Data Unavailable',
        sourceType: 'Live observation',
        isUnavailable: true,
        unavailableReason: 'Flood data unavailable for this area',
        metrics: {},
        description: 'Flood data unavailable for this area',
        recommendation: 'Exercise standard regional driving caution',
      };
      return unavailableSegment;
    }

    // Determine severity from real observation or forecast
    let severity: 'CRITICAL' | 'WARNING' | 'WATCH' | 'NORMAL' = 'NORMAL';
    let color = '#10B981';
    let riskLabel = 'Minimal Risk';
    const sourceType: 'Live observation' | 'Forecast' = hasLiveDischarge && (dischargeM3s ?? 0) > 30 ? 'Live observation' : 'Forecast';

    const maxDischarge = dischargeM3s ?? 0;
    const maxRain = rainfallMmH ?? 0;

    if (maxDischarge >= 250 || maxRain >= 25.0) {
      severity = 'CRITICAL';
      color = '#EF4444';
      riskLabel = 'High Risk';
    } else if (maxDischarge >= 100 || maxRain >= 12.0) {
      severity = 'WARNING';
      color = '#F97316';
      riskLabel = 'Medium Risk';
    } else if (maxDischarge >= 25 || maxRain >= 4.0) {
      severity = 'WATCH';
      color = '#F59E0B';
      riskLabel = 'Low Risk';
    }

    const segmentData = {
      coordinates: [lat, lon] as [number, number],
      severity,
      color,
      riskLabel,
      sourceType,
      metrics: {
        riverDischargeM3s: dischargeM3s,
        rainfallMmH: rainfallMmH,
      },
      description: `${sourceType}: ${hasLiveDischarge ? `GloFAS River Discharge ${dischargeM3s?.toFixed(1)} m³/s` : ''} ${rainfallMmH !== undefined ? `Precipitation ${rainfallMmH.toFixed(1)} mm/h` : ''}`.trim(),
      recommendation: severity === 'CRITICAL' ? 'High water accumulation reported. Detour advised.' : 'Normal passage clearance',
    };

    this.cache.set(cacheKey, { timestamp: Date.now(), data: segmentData });

    return {
      segmentIndex,
      startWaypointIndex: startWpIdx,
      endWaypointIndex: endWpIdx,
      ...segmentData,
    };
  }
}

export const routeFloodRiskService = new RouteFloodRiskService();
