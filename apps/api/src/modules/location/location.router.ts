import { Router, Request, Response } from 'express';
import {
  LocationRelevanceRequestSchema,
  StandardApiResponse,
  LocationRelevanceEvaluation,
  SavedLocation,
  LanguageCode,
} from '@smartcity/shared';
import { locationRelevanceService } from '../../services/locationRelevance.service.js';
import { config } from '../../config/index.js';

export const locationRouter = Router();

/**
 * GET /api/v1/location/relevance
 * Evaluates risk for current location and optional destination via query parameters
 */
locationRouter.get('/relevance', async (req: Request, res: Response) => {
  const rawLat = req.query.lat;
  const rawLon = req.query.lon;
  const lat = rawLat !== undefined ? parseFloat(rawLat as string) : 40.7128;
  const lon = rawLon !== undefined ? parseFloat(rawLon as string) : -74.0060;

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      type: 'https://smartcity-guardian.org/errors/validation-error',
      title: 'Invalid Coordinates',
      status: 400,
      detail: 'lat and lon must be valid geographic coordinates within [-90, 90] and [-180, 180]',
      instance: req.originalUrl,
    });
  }

  const destination = req.query.destination as string | undefined;
  const destLat = req.query.destLat ? parseFloat(req.query.destLat as string) : undefined;
  const destLon = req.query.destLon ? parseFloat(req.query.destLon as string) : undefined;

  if (destLat !== undefined && (isNaN(destLat) || destLat < -90 || destLat > 90)) {
    return res.status(400).json({
      type: 'https://smartcity-guardian.org/errors/validation-error',
      title: 'Invalid Destination Coordinates',
      status: 400,
      detail: 'destLat must be a valid latitude between -90 and 90',
      instance: req.originalUrl,
    });
  }

  if (destLon !== undefined && (isNaN(destLon) || destLon < -180 || destLon > 180)) {
    return res.status(400).json({
      type: 'https://smartcity-guardian.org/errors/validation-error',
      title: 'Invalid Destination Coordinates',
      status: 400,
      detail: 'destLon must be a valid longitude between -180 and 180',
      instance: req.originalUrl,
    });
  }

  const userId = (req.query.userId as string) || 'demo-user-1';
  const language = (req.query.language as LanguageCode) || config.DEFAULT_LANGUAGE;
  const radiusKm = req.query.radius ? parseFloat(req.query.radius as string) : config.ALERT_RADIUS_KM;

  const destCoords = destLat !== undefined && destLon !== undefined ? { latitude: destLat, longitude: destLon } : undefined;

  const evaluation = await locationRelevanceService.evaluateLocationRelevance({
    latitude: lat,
    longitude: lon,
    destination,
    destinationCoordinates: destCoords,
    userId,
    language,
    radiusKm,
  });

  const response: StandardApiResponse<LocationRelevanceEvaluation> = {
    success: true,
    data: evaluation,
    meta: {
      source: 'location-relevance-service',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: config.MOCK_MODE,
    },
  };

  res.json(response);
});

/**
 * POST /api/v1/location/relevance
 * Evaluates risk for current location and optional destination via JSON payload
 */
locationRouter.post('/relevance', async (req: Request, res: Response) => {
  const parsed = LocationRelevanceRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      type: 'https://smartcity-guardian.org/errors/validation-error',
      title: 'Invalid Location Relevance Request',
      status: 400,
      detail: parsed.error.issues.map((i) => i.message).join(', '),
      instance: req.originalUrl,
    });
  }

  const { latitude, longitude, destination, destinationCoordinates, userId, language } = parsed.data;

  const evaluation = await locationRelevanceService.evaluateLocationRelevance({
    latitude,
    longitude,
    destination,
    destinationCoordinates,
    userId: userId || 'demo-user-1',
    language: language || config.DEFAULT_LANGUAGE,
  });

  const response: StandardApiResponse<LocationRelevanceEvaluation> = {
    success: true,
    data: evaluation,
    meta: {
      source: 'location-relevance-service',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: config.MOCK_MODE,
    },
  };

  res.json(response);
});

/**
 * GET /api/v1/location/saved
 * Retrieves saved locations for user
 */
locationRouter.get('/saved', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'demo-user-1';
  const locations = locationRelevanceService.getSavedLocations(userId);

  const response: StandardApiResponse<SavedLocation[]> = {
    success: true,
    data: locations,
    meta: {
      source: 'user-locations-store',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
    },
  };

  res.json(response);
});

/**
 * POST /api/v1/location/saved
 * Saves a new location for user
 */
locationRouter.post('/saved', (req: Request, res: Response) => {
  const body = req.body || {};
  const rawLat = body.latitude !== undefined ? body.latitude : (Array.isArray(body.coordinates) ? body.coordinates[0] : undefined);
  const rawLon = body.longitude !== undefined ? body.longitude : (Array.isArray(body.coordinates) ? body.coordinates[1] : undefined);
  const lat = typeof rawLat === 'number' ? rawLat : (rawLat !== undefined ? parseFloat(rawLat) : NaN);
  const lon = typeof rawLon === 'number' ? rawLon : (rawLon !== undefined ? parseFloat(rawLon) : NaN);
  const userId = (req.headers['x-user-id'] as string) || body.userId || (req.query.userId as string) || 'demo-user-1';

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0 || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      type: 'https://smartcity-guardian.org/errors/validation-error',
      title: 'Missing Required Location Fields',
      status: 400,
      detail: 'name, latitude, and longitude are required and must be valid coordinates within bounds',
      instance: req.originalUrl,
    });
  }

  const newLoc: SavedLocation = {
    id: body.id || `loc-${Date.now()}`,
    userId,
    name: body.name,
    type: body.type || 'CUSTOM',
    latitude: lat,
    longitude: lon,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const saved = locationRelevanceService.saveLocation(newLoc);

  const response: StandardApiResponse<SavedLocation> = {
    success: true,
    data: saved,
    meta: {
      source: 'user-locations-store',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
    },
  };

  res.status(201).json(response);
});

/**
 * DELETE /api/v1/location/saved/:id
 * Deletes a saved location with user-scoped authorization
 */
locationRouter.delete('/saved/:id', (req: Request, res: Response) => {
  const locationId = req.params.id;
  const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string) || (req.body?.userId as string) || 'demo-user-1';

  const userLocations = locationRelevanceService.getSavedLocations(userId);
  const existsForUser = userLocations.some((l) => l.id === locationId);

  if (!existsForUser) {
    const existingAnywhere = locationRelevanceService.findLocationById(locationId);
    if (existingAnywhere && existingAnywhere.userId !== userId) {
      return res.status(403).json({
        type: 'https://smartcity-guardian.org/errors/forbidden',
        title: 'Access Forbidden',
        status: 403,
        detail: `Access denied: Cannot delete saved location belonging to another user.`,
        instance: req.originalUrl,
      });
    }

    return res.status(404).json({
      type: 'https://smartcity-guardian.org/errors/not-found',
      title: 'Location Not Found',
      status: 404,
      detail: `Saved location '${locationId}' for user '${userId}' was not found.`,
      instance: req.originalUrl,
    });
  }

  const deleted = locationRelevanceService.deleteSavedLocation(userId, locationId);
  res.status(200).json({
    success: deleted,
    message: `Saved location ${locationId} successfully removed`,
  });
});

// Comprehensive Curated Database of Locations Across India (Bengaluru + National Corridors)
const BENGALURU_DATABASE = [
  // 1. Bengaluru Metropolitan Locations (Preserved 100%)
  { lat: 12.9767, lon: 77.5713, name: 'Majestic (Kempegowda Bus Station & Metro Interchange)', area: 'Central Bangalore' },
  { lat: 12.9791, lon: 77.5913, name: 'Vidhana Soudha / High Court / Cubbon Park', area: 'Central Bangalore' },
  { lat: 12.9748, lon: 77.6094, name: 'MG Road (Mahatma Gandhi Road / Trinity)', area: 'Central Bangalore' },
  { lat: 12.9754, lon: 77.6067, name: 'Church Street / Brigade Road Commercial District', area: 'Central Bangalore' },
  { lat: 12.9352, lon: 77.6245, name: 'Koramangala 4th & 5th Block (Sony World Signal)', area: 'South Bangalore' },
  { lat: 12.9719, lon: 77.6412, name: 'Indiranagar (100 Feet Road & 12th Main)', area: 'East Bangalore' },
  { lat: 12.9856, lon: 77.7317, name: 'Whitefield (ITPL / International Tech Park)', area: 'East Bangalore' },
  { lat: 12.8452, lon: 77.6602, name: 'Electronic City Phase 1 (Infosys / Wipro Campus)', area: 'South Bangalore' },
  { lat: 12.8398, lon: 77.6775, name: 'Electronic City Phase 2', area: 'South Bangalore' },
  { lat: 12.9172, lon: 77.6228, name: 'Silk Board Junction (Hosur Road / ORR Interchange)', area: 'South Bangalore' },
  { lat: 12.9260, lon: 77.6762, name: 'Bellandur (EcoSpace / RMZ Ecoworld ORR Corridor)', area: 'East Bangalore' },
  { lat: 12.9116, lon: 77.6389, name: 'HSR Layout (Sector 1, 2, 3, 4 & 27th Main)', area: 'South Bangalore' },
  { lat: 12.9299, lon: 77.5824, name: 'Jayanagar (4th Block Complex & Shopping Arcade)', area: 'South Bangalore' },
  { lat: 12.9166, lon: 77.6101, name: 'BTM Layout (Udupi Garden Signal & 2nd Stage)', area: 'South Bangalore' },
  { lat: 12.9569, lon: 77.7011, name: 'Marathahalli Bridge & Multiplex Junction', area: 'East Bangalore' },
  { lat: 13.0358, lon: 77.6080, name: 'Hebbal Flyover & Bellary Road Express Highway', area: 'North Bangalore' },
  { lat: 13.0450, lon: 77.6200, name: 'Manyata Embassy Business Park (Outer Ring Road)', area: 'North Bangalore' },
  { lat: 13.0998, lon: 77.5963, name: 'Yelahanka New Town & Satellite Town', area: 'North Bangalore' },
  { lat: 12.9077, lon: 77.5855, name: 'JP Nagar (Rangasankara & 2nd Phase)', area: 'South Bangalore' },
  { lat: 12.9550, lon: 77.6480, name: 'Domlur / EGL (Embassy GolfLinks Tech Park)', area: 'East Bangalore' },
  { lat: 13.0031, lon: 77.5701, name: 'Malleshwaram (Sampige Road & 8th Cross)', area: 'West Bangalore' },
  { lat: 12.9984, lon: 77.5530, name: 'Rajajinagar (Orion Mall & World Trade Center)', area: 'West Bangalore' },
  { lat: 12.9100, lon: 77.6850, name: 'Sarjapur Road (Wipro Corporate Office)', area: 'Southeast Bangalore' },
  { lat: 12.9254, lon: 77.5468, name: 'Banashankari (BDA Complex & Temple)', area: 'South Bangalore' },
  { lat: 13.0012, lon: 77.6970, name: 'KR Puram (Hanging Bridge & Railway Station)', area: 'East Bangalore' },
  { lat: 12.9175, lon: 77.4837, name: 'Kengeri Satellite Town & Metro Terminal', area: 'West Bangalore' },
  { lat: 12.9422, lon: 77.5746, name: 'Basavanagudi (Gandhi Bazaar / Bull Temple)', area: 'South Bangalore' },
  { lat: 13.0185, lon: 77.6420, name: 'Kalyan Nagar / HRBR Layout / Kammanahalli', area: 'North Bangalore' },
  { lat: 13.0285, lon: 77.5197, name: 'Peenya Industrial Area 1st & 2nd Stage', area: 'Northwest Bangalore' },
  { lat: 12.9587, lon: 77.6486, name: 'Manipal Hospital (Old Airport Road - HAL)', area: 'East Bangalore' },
  { lat: 12.9634, lon: 77.5746, name: 'Victoria Hospital (Bangalore Medical College / City Market)', area: 'Central Bangalore' },
  { lat: 12.9345, lon: 77.6101, name: 'St. John’s Medical College & Hospital', area: 'South Bangalore' },
  { lat: 12.9378, lon: 77.5912, name: 'NIMHANS Hospital (Hosur Road)', area: 'South Bangalore' },
  { lat: 13.0298, lon: 77.5708, name: 'Yeshwanthpur Railway Station & APMC Yard', area: 'Northwest Bangalore' },
  { lat: 12.8912, lon: 77.5982, name: 'Bannerghatta Road (IIM Bangalore / Fortis)', area: 'South Bangalore' },
  { lat: 12.9360, lon: 77.6910, name: 'Rainbow Drive Layout (Sarjapur Road Flood Catchment)', area: 'East Bangalore' },
  { lat: 12.9400, lon: 77.7120, name: 'Varthur Lake Spillway & Gunjur Road', area: 'East Bangalore' },
  { lat: 13.1986, lon: 77.7066, name: 'Kempegowda International Airport (BLR / Devanahalli)', area: 'North Bangalore' },

  // 2. Hyderabad - Bengaluru Corridor (NH44)
  { lat: 17.3850, lon: 78.4867, name: 'Hyderabad (Charminar & Central Old City)', area: 'Telangana' },
  { lat: 17.4483, lon: 78.3742, name: 'Hyderabad (HITEC City / Cyber Towers)', area: 'Telangana' },
  { lat: 17.4344, lon: 78.4485, name: 'Hyderabad (Begumpet / Punjagutta)', area: 'Telangana' },
  { lat: 17.3750, lon: 78.4980, name: 'Hyderabad (Malakpet / Musi River Corridor)', area: 'Telangana' },
  { lat: 17.2403, lon: 78.4294, name: 'Hyderabad (Rajiv Gandhi International Airport - RGIA)', area: 'Telangana' },
  { lat: 16.7450, lon: 78.0250, name: 'Mahbubnagar (NH44 Highway Hub)', area: 'Telangana' },
  { lat: 15.8281, lon: 78.0373, name: 'Kurnool (Tungabhadra River Basin & City Center)', area: 'Andhra Pradesh' },
  { lat: 14.6819, lon: 77.6006, name: 'Anantapur (Clock Tower & NH44)', area: 'Andhra Pradesh' },
  { lat: 13.4350, lon: 77.7270, name: 'Chikkaballapur (NH44 North Gateway)', area: 'Karnataka' },

  // 3. Mumbai - Pune Expressway Corridor (NH48)
  { lat: 18.9402, lon: 72.8356, name: 'Mumbai (Chhatrapati Shivaji Maharaj Terminus - CSMT)', area: 'Maharashtra' },
  { lat: 19.0596, lon: 72.8295, name: 'Mumbai (Bandra West & Linking Road)', area: 'Maharashtra' },
  { lat: 19.0680, lon: 72.8680, name: 'Mumbai (Bandra Kurla Complex - BKC)', area: 'Maharashtra' },
  { lat: 19.0680, lon: 72.8800, name: 'Mumbai (Kurla West & Mithi River Basin)', area: 'Maharashtra' },
  { lat: 19.0860, lon: 72.8890, name: 'Mumbai (Ghatkopar / Eastern Express Highway)', area: 'Maharashtra' },
  { lat: 19.0178, lon: 72.8478, name: 'Mumbai (Dadar Central Interchange)', area: 'Maharashtra' },
  { lat: 19.0330, lon: 73.0297, name: 'Navi Mumbai (Vashi / Palm Beach Road)', area: 'Maharashtra' },
  { lat: 18.9894, lon: 73.1175, name: 'Panvel (Mumbai-Pune Expressway Western Terminal)', area: 'Maharashtra' },
  { lat: 18.7557, lon: 73.4091, name: 'Lonavala (Khandala / Bhor Ghat Expressway High Pass)', area: 'Maharashtra' },
  { lat: 18.6279, lon: 73.8009, name: 'Pimpri-Chinchwad (PCMC Industrial Tech Center)', area: 'Maharashtra' },
  { lat: 18.5204, lon: 73.8567, name: 'Pune (Shivajinagar / Pune Junction Central)', area: 'Maharashtra' },
  { lat: 18.5913, lon: 73.7389, name: 'Pune (Hinjawadi Rajiv Gandhi Infotech Park)', area: 'Maharashtra' },
  { lat: 18.5089, lon: 73.8077, name: 'Pune (Kothrud / Karve Road)', area: 'Maharashtra' },
  { lat: 18.5679, lon: 73.9143, name: 'Pune (Viman Nagar & Airport Corridor)', area: 'Maharashtra' },

  // 4. Delhi - Jaipur Corridor (NH48)
  { lat: 28.6139, lon: 77.2090, name: 'New Delhi (Connaught Place & Central Secretariat)', area: 'Delhi NCR' },
  { lat: 28.6692, lon: 77.2285, name: 'Old Delhi (Kashmiri Gate ISBT / Yamuna Lowlands)', area: 'Delhi NCR' },
  { lat: 28.5562, lon: 77.1000, name: 'Delhi (Indira Gandhi International Airport - IGI T3)', area: 'Delhi NCR' },
  { lat: 28.4595, lon: 77.0266, name: 'Gurugram (DLF Cyber City / NH48)', area: 'Haryana' },
  { lat: 28.4280, lon: 77.0480, name: 'Gurugram (Subhash Chowk / Sohna Road)', area: 'Haryana' },
  { lat: 28.2120, lon: 76.7880, name: 'Dharuhera (Rewari Industrial Bypass & NH48)', area: 'Haryana' },
  { lat: 28.1960, lon: 76.6180, name: 'Rewari (Civil Hospital & Railway Junction)', area: 'Haryana' },
  { lat: 27.7050, lon: 76.1950, name: 'Kotputli (Mid-Corridor Highway Hub)', area: 'Rajasthan' },
  { lat: 27.3880, lon: 75.9600, name: 'Shahpura (Jaipur-Delhi Highway Rest Stop)', area: 'Rajasthan' },
  { lat: 26.9124, lon: 75.7873, name: 'Jaipur (Hawa Mahal & Walled Pink City)', area: 'Rajasthan' },
  { lat: 26.9200, lon: 75.7900, name: 'Jaipur (Jaipur Junction Railway Station)', area: 'Rajasthan' },
  { lat: 26.8520, lon: 75.8080, name: 'Jaipur (Malviya Nagar & JLN Marg)', area: 'Rajasthan' },
  { lat: 26.8180, lon: 75.7680, name: 'Jaipur (Sanganer / Dravyavati River Basin)', area: 'Rajasthan' },
  { lat: 26.8289, lon: 75.8056, name: 'Jaipur (Jaipur International Airport)', area: 'Rajasthan' },

  // 5. Additional Key National Metros
  { lat: 13.0827, lon: 80.2707, name: 'Chennai (Central Station & George Town)', area: 'Tamil Nadu' },
  { lat: 22.5726, lon: 88.3639, name: 'Kolkata (Park Street & Esplanade)', area: 'West Bengal' },
  { lat: 23.0225, lon: 72.5714, name: 'Ahmedabad (Sabarmati Riverfront & Ashram)', area: 'Gujarat' },
];

/**
 * GET /api/v1/location/search?q=...
 * Real-time geocoding search for ANY point across India
 */
locationRouter.get('/search', async (req: Request, res: Response) => {
  const rawQ = req.query.q;
  const queryStr = Array.isArray(rawQ) ? (rawQ[0] as string) : (rawQ as string);
  const query = (typeof queryStr === 'string' ? queryStr : '').trim();
  if (!query) {
    return res.json({ success: true, results: BENGALURU_DATABASE.slice(0, 15) });
  }

  // 1. Instant local search across curated national database
  const qLower = query.toLowerCase();
  const localMatches = BENGALURU_DATABASE.filter(
    (item) => item.name.toLowerCase().includes(qLower) || item.area.toLowerCase().includes(qLower)
  );

  // If we have strong local matches, return them immediately
  if (localMatches.length >= 3) {
    return res.json({ success: true, source: 'local_database', results: localMatches });
  }

  // 2. Real-time Nominatim lookup across India
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const isBangaloreSpecific = qLower.includes('bangalore') || qLower.includes('bengaluru');
    const nominatimUrl = isBangaloreSpecific
      ? `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&viewbox=77.30,13.30,77.90,12.70&bounded=1&countrycodes=in`
      : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=in`;

    const osmResp = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'SmartCityGuardian/2.1 (contact@smartcity-guardian.gov.in)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (osmResp.ok) {
      const osmData = (await osmResp.json()) as any[];
      const liveResults = osmData.map((item) => ({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        name: item.name || item.display_name.split(',')[0],
        displayName: item.display_name,
        area: item.type || 'India',
      }));

      // Combine local + live results avoiding duplicate coordinates
      const combined = [...localMatches];
      for (const live of liveResults) {
        if (!combined.some((c) => Math.hypot(c.lat - live.lat, c.lon - live.lon) < 0.005)) {
          combined.push(live);
        }
      }

      return res.json({ success: true, source: 'osm_live', results: combined });
    }
  } catch {
    // If online search times out, return local matches
  }

  return res.json({
    success: true,
    source: 'fallback',
    results: localMatches.length > 0 ? localMatches : BENGALURU_DATABASE.slice(0, 5),
  });
});

/**
 * GET /api/v1/location/reverse?lat=...&lon=...
 * Reverse geocoding for any clicked point in India
 */
locationRouter.get('/reverse', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ success: false, error: 'Valid lat [-90, 90] and lon [-180, 180] required' });
  }

  // Find nearest landmark in national database
  let nearest = BENGALURU_DATABASE[0];
  let minDistance = Infinity;
  for (const item of BENGALURU_DATABASE) {
    const d = Math.hypot((item.lat - lat) * 111, (item.lon - lon) * 85);
    if (d < minDistance) {
      minDistance = d;
      nearest = item;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const revUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const osmResp = await fetch(revUrl, {
      headers: { 'User-Agent': 'SmartCityGuardian/2.1 (contact@smartcity-guardian.gov.in)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (osmResp.ok) {
      const data = (await osmResp.json()) as any;
      const road = data.address?.road || data.address?.suburb || data.address?.neighbourhood || data.address?.city_district;
      const city = data.address?.city || data.address?.town || data.address?.state_district || data.address?.state;
      const formattedName = road
        ? `${road}${city ? `, ${city}` : ''}`
        : data.display_name.split(',').slice(0, 2).join(',');

      return res.json({
        success: true,
        lat,
        lon,
        name: formattedName,
        fullAddress: data.display_name,
        nearestLandmark: nearest.name,
      });
    }
  } catch {
    // Fallback below
  }

  const isNearBlr = lat >= 12.6 && lat <= 13.4 && lon >= 77.3 && lon <= 77.9;
  const regionTag = isNearBlr ? 'Bengaluru' : nearest.area || 'India';

  return res.json({
    success: true,
    lat,
    lon,
    name: minDistance < 2.0 ? `${nearest.name} Area` : `${regionTag} (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    nearestLandmark: nearest.name,
    distanceToLandmarkKm: parseFloat(minDistance.toFixed(2)),
  });
});
