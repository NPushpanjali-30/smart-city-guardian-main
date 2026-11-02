import { Router, Request, Response } from 'express';
import {
  facilityIntelligenceService,
  VERIFIED_INDIA_FACILITIES,
} from '../../services/facilities/facilityIntelligence.service.js';

export const facilitiesRouter = Router();

/**
 * GET /api/v1/facilities/corridor
 * Queries facilities along a route between origin and destination coordinates
 */
facilitiesRouter.get('/corridor', async (req: Request, res: Response) => {
  try {
    const originLat = req.query.originLat ? parseFloat(req.query.originLat as string) : undefined;
    const originLon = req.query.originLon ? parseFloat(req.query.originLon as string) : undefined;
    const destLat = req.query.destLat ? parseFloat(req.query.destLat as string) : undefined;
    const destLon = req.query.destLon ? parseFloat(req.query.destLon as string) : undefined;
    const radius = req.query.radius ? parseFloat(req.query.radius as string) : 15;
    const type = req.query.type as string | undefined;

    let waypoints: [number, number][] = [];
    if (originLat !== undefined && originLon !== undefined && destLat !== undefined && destLon !== undefined) {
      waypoints = [
        [originLat, originLon],
        [(originLat + destLat) / 2, (originLon + destLon) / 2],
        [destLat, destLon],
      ];
    } else if (originLat !== undefined && originLon !== undefined) {
      waypoints = [[originLat, originLon]];
    } else {
      // Default to Bangalore center if no points specified
      waypoints = [[12.9716, 77.5946]];
    }

    const facilities = await facilityIntelligenceService.getFacilitiesAlongRoute(waypoints, radius, type);

    res.status(200).json({
      success: true,
      data: facilities,
      meta: {
        total: facilities.length,
        radiusKm: radius,
        typeFilter: type || 'ALL',
        source: 'smartcity-facility-intelligence-engine',
        retrievedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FACILITIES_RETRIEVAL_FAILED',
        message: err.message || 'Failed to retrieve corridor facilities',
      },
    });
  }
});

/**
 * POST /api/v1/facilities/corridor
 * Queries facilities along exact polyline waypoints from routing engine
 */
facilitiesRouter.post('/corridor', async (req: Request, res: Response) => {
  try {
    const { waypoints, radiusKm = 15, type } = req.body;

    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_WAYPOINTS',
          message: 'waypoints array of [lat, lon] coordinates is required',
        },
      });
    }

    const cleanWaypoints: [number, number][] = waypoints
      .filter((pt: any) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1]))
      .map((pt: any) => [Number(pt[0]), Number(pt[1])]);

    const facilities = await facilityIntelligenceService.getFacilitiesAlongRoute(cleanWaypoints, radiusKm, type);

    res.status(200).json({
      success: true,
      data: facilities,
      meta: {
        total: facilities.length,
        radiusKm,
        typeFilter: type || 'ALL',
        source: 'smartcity-facility-intelligence-engine',
        retrievedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FACILITIES_RETRIEVAL_FAILED',
        message: err.message || 'Failed to retrieve corridor facilities',
      },
    });
  }
});

/**
 * GET /api/v1/facilities/nearby
 * Queries facilities near a single geographic coordinate
 */
facilitiesRouter.get('/nearby', async (req: Request, res: Response) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : 12.9716;
    const lon = req.query.lon ? parseFloat(req.query.lon as string) : 77.5946;
    const radius = req.query.radius ? parseFloat(req.query.radius as string) : 10;
    const type = req.query.type as string | undefined;

    const facilities = await facilityIntelligenceService.getFacilitiesNearby(lat, lon, radius, type);

    res.status(200).json({
      success: true,
      data: facilities,
      meta: {
        center: [lat, lon],
        total: facilities.length,
        radiusKm: radius,
        typeFilter: type || 'ALL',
        retrievedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FACILITIES_RETRIEVAL_FAILED',
        message: err.message || 'Failed to retrieve nearby facilities',
      },
    });
  }
});

/**
 * GET /api/v1/facilities/all
 * Returns full verified real facility records across all Indian corridors
 */
facilitiesRouter.get('/all', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: VERIFIED_INDIA_FACILITIES,
    meta: {
      total: VERIFIED_INDIA_FACILITIES.length,
      retrievedAt: new Date().toISOString(),
    },
  });
});
