/**
 * Map Configuration & Road Routing Helpers
 */

const getCartoApiKey = (): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CARTO_API_KEY) {
      return (import.meta as any).env.VITE_CARTO_API_KEY;
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env?.VITE_CARTO_API_KEY) {
      return process.env.VITE_CARTO_API_KEY;
    }
  } catch {}
  return '';
};

const cartoKey = getCartoApiKey();

export type MapBasemapId =
  | 'OPENSTREETMAP'
  | 'ESRI_STREETS'
  | 'ESRI_SATELLITE'
  | 'CARTO_DARK'
  | 'CARTO_LIGHT'
  | 'OSM_HOT'
  | 'CARTO_VOYAGER'
  | 'ESRI_TOPO';

export interface MapBasemapConfig {
  id: MapBasemapId;
  name: string;
  subtitle: string;
  icon: string;
  url: string;
  attribution: string;
  subdomains?: string[];
  hasOverlay?: boolean;
  overlayUrl?: string;
  maxZoom?: number;
  maxNativeZoom?: number;
  detectRetina?: boolean;
}

export const BASEMAP_CONFIGS: Record<MapBasemapId, MapBasemapConfig> = {
  OPENSTREETMAP: {
    id: 'OPENSTREETMAP',
    name: 'OpenStreetMap',
    subtitle: 'Standard Open Cartography • Razor Sharp',
    icon: '🗺️',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
    detectRetina: false,
  },
  ESRI_STREETS: {
    id: 'ESRI_STREETS',
    name: 'Esri Navigation',
    subtitle: 'Google Maps Style • High Precision GIS',
    icon: '🌟',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, METI, TomTom',
    maxZoom: 19,
    maxNativeZoom: 17,
    detectRetina: false,
  },
  ESRI_SATELLITE: {
    id: 'ESRI_SATELLITE',
    name: 'Satellite Hybrid',
    subtitle: 'High-Res Aerial + Street Overlays',
    icon: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    hasOverlay: true,
    overlayUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    maxNativeZoom: 18,
    detectRetina: false,
  },
  CARTO_DARK: {
    id: 'CARTO_DARK',
    name: 'Cyber Dark',
    subtitle: 'Disaster Command Night Mode',
    icon: '🌙',
    url: cartoKey
      ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${cartoKey}`
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    hasOverlay: !cartoKey,
    overlayUrl: !cartoKey
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
      : undefined,
    subdomains: cartoKey ? ['a', 'b', 'c', 'd'] : undefined,
    attribution: cartoKey
      ? '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>'
      : 'Tiles &copy; Esri &mdash; Sources: Esri, DeLorme, NAVTEQ',
    maxZoom: 19,
    maxNativeZoom: cartoKey ? 20 : 16,
    detectRetina: Boolean(cartoKey),
  },
  CARTO_LIGHT: {
    id: 'CARTO_LIGHT',
    name: 'Positron Light',
    subtitle: 'Apple Maps Minimalist Clean',
    icon: '🏙️',
    url: cartoKey
      ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${cartoKey}`
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    hasOverlay: !cartoKey,
    overlayUrl: !cartoKey
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
      : undefined,
    subdomains: cartoKey ? ['a', 'b', 'c', 'd'] : undefined,
    attribution: cartoKey
      ? '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>'
      : 'Tiles &copy; Esri &mdash; Sources: Esri, DeLorme, NAVTEQ',
    maxZoom: 19,
    maxNativeZoom: cartoKey ? 20 : 16,
    detectRetina: Boolean(cartoKey),
  },
  OSM_HOT: {
    id: 'OSM_HOT',
    name: 'Humanitarian OSM',
    subtitle: 'Disaster Relief Cartography',
    icon: '🚨',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    subdomains: ['a', 'b'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noreferrer">HOT</a> hosted by <a href="https://openstreetmap.fr/" target="_blank" rel="noreferrer">OSM France</a>',
    maxZoom: 19,
    maxNativeZoom: 19,
    detectRetina: false,
  },
  CARTO_VOYAGER: {
    id: 'CARTO_VOYAGER',
    name: cartoKey ? 'Voyager HD' : 'OpenStreetMap HD',
    subtitle: cartoKey ? 'Google Maps Style • Razor Sharp' : 'Global Open Cartography • High Detail',
    icon: '🗺️',
    url: cartoKey
      ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${cartoKey}`
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: cartoKey ? ['a', 'b', 'c', 'd'] : undefined,
    attribution: cartoKey
      ? '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: cartoKey ? 20 : 19,
    maxNativeZoom: cartoKey ? 20 : 19,
    detectRetina: Boolean(cartoKey),
  },
  ESRI_TOPO: {
    id: 'ESRI_TOPO',
    name: 'Topographic Relief',
    subtitle: 'Contour & Drainage Terrain',
    icon: '⛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, METI, TomTom',
    maxZoom: 19,
    maxNativeZoom: 17,
    detectRetina: false,
  },
};

export interface OsrmStep {
  name: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number];
  };
}

export interface BangaloreTrafficDurationResult {
  durationMinutes: number;
  durationSeconds: number;
  effectiveSpeedKmh: number;
  freeFlowMinutes: number;
  signalDelayMinutes: number;
  chokeDelayMinutes: number;
  timeMultiplier: number;
  isPeakHours: boolean;
  detectedChokepoints: string[];
}

export interface OsrmRouteResult {
  coordinates: [number, number][];
  distanceKm: number;
  durationMin: number;
  steps: OsrmStep[];
  majorRoads: string[];
  trafficCalibrated?: boolean;
  blrTrafficDetails?: {
    avgSpeedKmh: number;
    chokepoints: string[];
    isPeakHours: boolean;
  };
}

export const BANGALORE_CHOKEPOINTS: Array<{
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  penaltyMin: number;
}> = [
  { name: 'Silk Board Junction', lat: 12.9172, lon: 77.6228, radiusKm: 1.2, penaltyMin: 6 },
  { name: 'Marathahalli Bridge / Multiplex', lat: 12.9569, lon: 77.7011, radiusKm: 1.1, penaltyMin: 5 },
  { name: 'KR Puram / Tin Factory', lat: 13.0012, lon: 77.6970, radiusKm: 1.2, penaltyMin: 6 },
  { name: 'Hebbal Flyover / Airport Rd', lat: 13.0358, lon: 77.6080, radiusKm: 1.2, penaltyMin: 5 },
  { name: 'Bellandur EcoSpace ORR', lat: 12.9260, lon: 77.6762, radiusKm: 1.1, penaltyMin: 5 },
  { name: 'Hoodi / ITPL Whitefield Corridor', lat: 12.9856, lon: 77.7317, radiusKm: 1.3, penaltyMin: 4 },
  { name: 'Goraguntepalya / Yeshwantpur', lat: 13.0285, lon: 77.5450, radiusKm: 1.1, penaltyMin: 5 },
  { name: 'Bannerghatta Rd / Dairy Circle', lat: 12.9370, lon: 77.5990, radiusKm: 1.0, penaltyMin: 4 },
  { name: 'Sony World Koramangala 80ft', lat: 12.9352, lon: 77.6245, radiusKm: 0.9, penaltyMin: 3 },
  { name: 'Kengeri / Mysore Road Satellite', lat: 12.9175, lon: 77.4837, radiusKm: 1.2, penaltyMin: 4 },
];

/**
 * Bangalore Real-World Traffic Duration Engine
 * Free-flow raw OSRM assumes 50-70 km/h uninterrupted highway driving.
 * This engine calibrates real-world Bangalore urban speeds (14-25 km/h),
 * traffic signal junction wait cycles (~1 signal per 1.15 km with 38s red wait),
 * peak vs off-peak IST hours, chokepoint congestion penalties, and active flood risk.
 */
export function calculateBangaloreTrafficDuration(
  distanceKm: number,
  _rawOsrmSeconds?: number,
  options?: {
    routeCoordinates?: [number, number][];
    majorRoads?: string[];
    floodRisk?: number;
    customIstHour?: number;
  }
): BangaloreTrafficDurationResult {
  if (distanceKm <= 0.05) {
    return {
      durationMinutes: 1,
      durationSeconds: 60,
      effectiveSpeedKmh: 15,
      freeFlowMinutes: 1,
      signalDelayMinutes: 0,
      chokeDelayMinutes: 0,
      timeMultiplier: 1.0,
      isPeakHours: false,
      detectedChokepoints: [],
    };
  }

  const { routeCoordinates = [], majorRoads = [], floodRisk = 0, customIstHour } = options || {};

  // 1. Realistic free-flow speed curve across Bangalore urban corridors
  let freeFlowSpeed: number;
  if (distanceKm < 5) {
    freeFlowSpeed = 24.0; // short urban trips: stop-and-go streets
  } else if (distanceKm < 15) {
    freeFlowSpeed = 28.0; // medium trips: arterial roads
  } else if (distanceKm < 35) {
    freeFlowSpeed = 36.0; // long cross-city trips: ORR / express segments
  } else {
    freeFlowSpeed = 44.0; // extended suburban corridors
  }

  // Base driving time in minutes
  const freeFlowMinutes = (distanceKm / freeFlowSpeed) * 60;

  // 2. Realistic signal junctions in Bangalore: ~1 signal per 1.15 km with 38-second average wait
  const estimatedJunctions = Math.max(1, Math.round(distanceKm / 1.15));
  const signalDelayMinutes = (estimatedJunctions * 38) / 60;

  // 3. Bangalore Time-of-Day factor (IST timezone UTC+5:30)
  let istHours: number;
  if (typeof customIstHour === 'number') {
    istHours = customIstHour;
  } else {
    const now = new Date();
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
    istHours = (utcHours + 5.5) % 24;
  }

  const isMorningPeak = istHours >= 8.5 && istHours <= 11.5;
  const isEveningPeak = istHours >= 17.0 && istHours <= 20.5;
  const isPeakHours = isMorningPeak || isEveningPeak;

  let timeMultiplier = 1.0;
  if (isPeakHours) {
    timeMultiplier = 1.15; // Peak rush (+15%)
  } else if ((istHours > 11.5 && istHours < 17.0) || (istHours > 20.5 && istHours <= 22.0)) {
    timeMultiplier = 1.04; // Normal daytime / busy (+4%)
  } else if (istHours >= 23.0 || istHours <= 6.0) {
    timeMultiplier = 0.85; // Late night free flow (-15%)
  } else {
    timeMultiplier = 0.95; // Early morning transition (-5%)
  }

  // 4. Bangalore chokepoint proximity & corridor analysis
  const detectedChokepoints: string[] = [];
  let rawChokeDelay = 0;

  for (const cp of BANGALORE_CHOKEPOINTS) {
    let matched = false;
    if (routeCoordinates.length > 0) {
      for (const pt of routeCoordinates) {
        // Approximate planar distance in km for Bangalore latitude (13 deg N)
        const d = Math.hypot((pt[0] - cp.lat) * 111, (pt[1] - cp.lon) * 85);
        if (d <= cp.radiusKm) {
          matched = true;
          break;
        }
      }
    }

    if (!matched && majorRoads.length > 0) {
      const cpFirstToken = cp.name.toLowerCase().split(/[\s/]+/)[0];
      if (majorRoads.some((r) => r.toLowerCase().includes(cpFirstToken))) {
        matched = true;
      }
    }

    if (matched) {
      detectedChokepoints.push(cp.name);
      rawChokeDelay += cp.penaltyMin;
    }
  }

  // Cap cumulative chokepoint penalty at 12 minutes to prevent unrealistic compounding
  const chokeDelayMinutes = Math.min(12, rawChokeDelay);

  // 5. Total baseline minutes
  let totalMinutes = (freeFlowMinutes + signalDelayMinutes + chokeDelayMinutes) * timeMultiplier;

  // 6. Flood & waterlogging risk penalty (slows down traffic)
  if (floodRisk >= 50) {
    totalMinutes *= 1.30; // 30% crawl due to severe water accumulation
  } else if (floodRisk >= 20) {
    totalMinutes *= 1.15; // 15% slow-down due to cautious driving
  }

  // Physical Bangalore floor: ~28 km/h absolute maximum average speed across urban city
  const calibratedMinutes = Math.max(
    Math.round(distanceKm * 2.1),
    Math.round(totalMinutes)
  );

  const durationSeconds = calibratedMinutes * 60;
  const effectiveSpeedKmh = Number((distanceKm / (calibratedMinutes / 60)).toFixed(1));

  return {
    durationMinutes: calibratedMinutes,
    durationSeconds,
    effectiveSpeedKmh,
    freeFlowMinutes: Number(freeFlowMinutes.toFixed(1)),
    signalDelayMinutes: Number(signalDelayMinutes.toFixed(1)),
    chokeDelayMinutes,
    timeMultiplier,
    isPeakHours,
    detectedChokepoints,
  };
}

/**
 * High-Accuracy OpenStreetMap OSRM Road Router
 * Retrieves real road-conforming geometries, turn-by-turn steps, and alternative paths,
 * calibrated with realistic Bangalore urban traffic speeds and signal delays.
 */
export async function queryOpenStreetMapRoutes(
  start: [number, number],
  end: [number, number]
): Promise<OsrmRouteResult[]> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 4000);
  try {
    const coordsStr = `${start[1]},${start[0]};${end[1]},${end[0]}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true&annotations=true&alternatives=true`;
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
      return data.routes.map((r: any) => {
        const latLonCoords: [number, number][] = (r.geometry.coordinates || []).map(
          (c: [number, number]) => [c[1], c[0]]
        );
        // Ensure start and end coordinates pin precisely to the user's requested locations
        if (latLonCoords.length > 0) {
          latLonCoords[0] = [start[0], start[1]];
          latLonCoords[latLonCoords.length - 1] = [end[0], end[1]];
        }
        const distanceKm = Number((r.distance / 1000).toFixed(1));
        const rawOsrmSeconds = Number(r.duration) || (distanceKm * 60);
        const steps: OsrmStep[] = (r.legs || []).flatMap((leg: any) => leg.steps || []);
        const roadNames = steps
          .map((s) => s.name?.trim())
          .filter((n): n is string => Boolean(n && n.length > 2 && !n.includes('{')));
        const uniqueRoads = Array.from(new Set(roadNames));

        const trafficCalib = calculateBangaloreTrafficDuration(distanceKm, rawOsrmSeconds, {
          routeCoordinates: latLonCoords,
          majorRoads: uniqueRoads,
        });

        // Scale individual step durations proportionally to match realistic Bangalore traffic
        const rawStepDurationTotal = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
        const scaleFactor = rawStepDurationTotal > 0
          ? trafficCalib.durationSeconds / rawStepDurationTotal
          : trafficCalib.durationSeconds / Math.max(1, rawOsrmSeconds);

        const calibratedSteps: OsrmStep[] = steps.map((s) => ({
          ...s,
          duration: Math.max(5, Math.round((s.duration || 10) * scaleFactor)),
        }));

        return {
          coordinates: latLonCoords,
          distanceKm,
          durationMin: trafficCalib.durationMinutes,
          steps: calibratedSteps,
          majorRoads: uniqueRoads,
          trafficCalibrated: true,
          blrTrafficDetails: {
            avgSpeedKmh: trafficCalib.effectiveSpeedKmh,
            chokepoints: trafficCalib.detectedChokepoints,
            isPeakHours: trafficCalib.isPeakHours,
          },
        };
      });
    }
  } catch {
    // Graceful offline fallback
  } finally {
    clearTimeout(timeout);
  }
  return [];
}

/**
 * Query OSRM with intermediate detour waypoint (used when direct road intersects flood hazard)
 * Calibrated with real-world Bangalore traffic speeds.
 */
export async function queryOpenStreetMapDetour(
  start: [number, number],
  via: [number, number],
  end: [number, number]
): Promise<OsrmRouteResult | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 4000);
  try {
    const coordsStr = `${start[1]},${start[0]};${via[1]},${via[0]};${end[1]},${end[0]}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true&annotations=true`;
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
      const r = data.routes[0];
      const latLonCoords: [number, number][] = (r.geometry.coordinates || []).map(
        (c: [number, number]) => [c[1], c[0]]
      );
      if (latLonCoords.length > 0) {
        latLonCoords[0] = [start[0], start[1]];
        latLonCoords[latLonCoords.length - 1] = [end[0], end[1]];
      }
      const distanceKm = Number((r.distance / 1000).toFixed(1));
      const rawOsrmSeconds = Number(r.duration) || (distanceKm * 60);
      const steps: OsrmStep[] = (r.legs || []).flatMap((leg: any) => leg.steps || []);
      const roadNames = steps
        .map((s) => s.name?.trim())
        .filter((n): n is string => Boolean(n && n.length > 2 && !n.includes('{')));
      const uniqueRoads = Array.from(new Set(roadNames));

      const trafficCalib = calculateBangaloreTrafficDuration(distanceKm, rawOsrmSeconds, {
        routeCoordinates: latLonCoords,
        majorRoads: uniqueRoads,
      });

      const rawStepDurationTotal = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
      const scaleFactor = rawStepDurationTotal > 0
        ? trafficCalib.durationSeconds / rawStepDurationTotal
        : trafficCalib.durationSeconds / Math.max(1, rawOsrmSeconds);

      const calibratedSteps: OsrmStep[] = steps.map((s) => ({
        ...s,
        duration: Math.max(5, Math.round((s.duration || 10) * scaleFactor)),
      }));

      return {
        coordinates: latLonCoords,
        distanceKm,
        durationMin: trafficCalib.durationMinutes,
        steps: calibratedSteps,
        majorRoads: uniqueRoads,
        trafficCalibrated: true,
        blrTrafficDetails: {
          avgSpeedKmh: trafficCalib.effectiveSpeedKmh,
          chokepoints: trafficCalib.detectedChokepoints,
          isPeakHours: trafficCalib.isPeakHours,
        },
      };
    }
  } catch {
    // Fallback
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

/**
 * Coordinate string parser to support text like:
 * - "13.00481, 77.59901" or "13.00481; 77.59901" or "13.00481 77.59901"
 * - "[13.00481, 77.59901]" or "(13.00481, 77.59901)"
 * - "Bengaluru (13.00481, 77.59901)" or "Location (19.0760, 72.8777)"
 * - Negative coordinates like "-12.5, -77.2"
 * - Integer coordinates like "13, 77"
 */
export function parseCoordinateInput(input: string): { lat: number; lon: number; name: string } | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match two signed float/integer numbers separated by comma, semicolon, or whitespace
  const match = trimmed.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const isBangalore = lat >= 12.6 && lat <= 13.4 && lon >= 77.3 && lon <= 77.9;
      const isWiderBangalore = lat >= 12.0 && lat <= 14.0 && lon >= 77.0 && lon <= 78.5;

      let name = trimmed;
      // If input was pure numbers or doesn't have an explicit label, generate a clean readable name
      if (!/[a-zA-Z]/.test(trimmed) || /^(coordinates?|location|point)\b/i.test(trimmed)) {
        if (isBangalore || isWiderBangalore) {
          name = `Bengaluru (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
        } else {
          name = `Location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
        }
      }

      return {
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
        name,
      };
    }
  }
  return null;
}

