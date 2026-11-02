import { Router, Request, Response } from 'express';
import { dataAggregator } from '../../services/dataAggregator.js';

export const trafficRouter = Router();

/**
 * GET /api/v1/traffic
 * Unified traffic overview with flows, incidents, and congestion summary
 */
trafficRouter.get(['/', ''], async (req: Request, res: Response) => {
  try {
    const { flows, incidents } = await dataAggregator.refreshTraffic();

    res.status(200).json({
      success: true,
      data: {
        flows,
        incidents,
        summary: {
          totalFlows: flows.length,
          totalIncidents: incidents.length,
          averageCongestion: flows.length > 0
            ? Math.round(flows.reduce((acc, f) => acc + (f.congestionLevel || 0), 0) / flows.length)
            : 0,
        },
      },
      flows,
      incidents,
      meta: {
        source: flows[0]?.source || 'traffic-service',
        retrievedAt: new Date().toISOString(),
        freshness: flows[0]?.freshness || 'LIVE',
        dataAgeSeconds: flows[0]?.dataAgeSeconds || 0,
        isMock: flows[0]?.freshness === 'MOCK',
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      success: false,
      error: {
        code: 'TRAFFIC_UNAVAILABLE',
        message: `Traffic provider failure: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/traffic/live
 */
trafficRouter.get('/live', async (req: Request, res: Response) => {
  try {
    const { flows } = await dataAggregator.refreshTraffic();

    res.status(200).json({
      success: true,
      data: flows,
      meta: {
        source: flows[0]?.source || 'traffic-service',
        retrievedAt: new Date().toISOString(),
        freshness: flows[0]?.freshness || 'LIVE',
        dataAgeSeconds: flows[0]?.dataAgeSeconds || 0,
        isMock: flows[0]?.freshness === 'MOCK',
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      success: false,
      error: {
        code: 'TRAFFIC_UNAVAILABLE',
        message: `Traffic provider failure: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/traffic/flows (alias for backwards compatibility)
 */
trafficRouter.get('/flows', async (req: Request, res: Response) => {
  const { flows } = await dataAggregator.refreshTraffic();
  res.status(200).json({
    status: 'ok',
    data: flows,
  });
});

/**
 * GET /api/v1/traffic/incidents
 */
trafficRouter.get('/incidents', async (req: Request, res: Response) => {
  try {
    const { incidents } = await dataAggregator.refreshTraffic();

    res.status(200).json({
      success: true,
      data: incidents,
      meta: {
        source: incidents[0]?.source || 'traffic-service',
        retrievedAt: new Date().toISOString(),
        freshness: incidents[0]?.freshness || 'LIVE',
        isMock: incidents[0]?.freshness === 'MOCK',
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      success: false,
      error: {
        code: 'INCIDENTS_UNAVAILABLE',
        message: `Traffic incidents retrieval failure: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/traffic/roads
 */
trafficRouter.get('/roads', async (req: Request, res: Response) => {
  try {
    const { trafficIntelligenceService } = await import('../../services/traffic/trafficIntelligence.service.js');
    const roadStates = await trafficIntelligenceService.getRoadTrafficStates();

    res.status(200).json({
      success: true,
      data: roadStates,
      roads: roadStates,
      meta: {
        source: 'traffic-intelligence-engine',
        retrievedAt: new Date().toISOString(),
        totalRoads: roadStates.length,
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRAFFIC_INTELLIGENCE_ERROR',
        message: `Could not retrieve road traffic intelligence: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/traffic/corridors
 */
trafficRouter.get('/corridors', async (req: Request, res: Response) => {
  try {
    const { trafficCorridorService } = await import('../../services/traffic/trafficCorridor.service.js');
    const corridors = await trafficCorridorService.getCorridors();
    const advisories = await trafficCorridorService.getAuthorityAdvisories();

    res.status(200).json({
      success: true,
      data: {
        corridors,
        advisories,
      },
      corridors,
      advisories,
      meta: {
        source: 'traffic-corridor-service',
        retrievedAt: new Date().toISOString(),
        totalCorridors: corridors.length,
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'CORRIDOR_INTELLIGENCE_ERROR',
        message: `Could not retrieve corridor intelligence: ${msg}`,
      },
    });
  }
});

