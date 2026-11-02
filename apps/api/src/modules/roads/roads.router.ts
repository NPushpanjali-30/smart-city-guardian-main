import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { resolveMockPath } from '../../utils/mockPath.js';

export const roadsRouter = Router();

function loadMockRoads() {
  try {
    const mockPath = resolveMockPath('mock/roads.json');
    if (fs.existsSync(mockPath)) {
      return JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return { roads: [] };
}

/**
 * GET /api/v1/roads/state & GET /api/v1/roads
 */
const getRoadsHandler = (req: Request, res: Response) => {
  const data = loadMockRoads();
  const stateFilter = req.query.state as string | undefined;

  let roads = data.roads || [];
  if (stateFilter) {
    roads = roads.filter((r: { accessibilityState: string }) => r.accessibilityState === stateFilter);
  }

  res.status(200).json({
    success: true,
    data: roads,
    meta: {
      source: 'metro-road-network',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
    },
  });
};

roadsRouter.get('/', getRoadsHandler);
roadsRouter.get('/state', getRoadsHandler);

/**
 * GET /api/v1/roads/flood-risk
 */
roadsRouter.get('/flood-risk', async (req: Request, res: Response) => {
  const { floodIntelligenceService } = await import('../../services/flood/floodIntelligence.service.js');
  const evaluation = await floodIntelligenceService.evaluateRisk();

  const stateFilter = req.query.state as string | undefined;
  let roads = evaluation.affectedRoads;
  if (stateFilter) {
    roads = roads.filter((r) => r.accessibilityState === stateFilter || r.riskState === stateFilter);
  }

  res.status(200).json({
    success: true,
    data: roads,
    meta: {
      source: 'road-flood-risk-service',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
      totalRoads: roads.length,
    },
  });
});

/**
 * GET /api/v1/roads/risk
 */
roadsRouter.get('/risk', async (req: Request, res: Response) => {
  try {
    const { roadRiskService } = await import('../../services/roads/roadRisk.service.js');
    let risks = await roadRiskService.getRoadRisks();

    const stateFilter = req.query.state as string | undefined;
    if (stateFilter) {
      risks = risks.filter((r) => r.accessibility === stateFilter || r.flood.state === stateFilter || r.traffic.state === stateFilter);
    }

    res.status(200).json({
      success: true,
      data: risks,
      risks,
      meta: {
        source: 'road-combined-risk-service',
        retrievedAt: new Date().toISOString(),
        totalRoads: risks.length,
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'ROAD_RISK_ERROR',
        message: `Could not retrieve road risk data: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/roads/:id
 */
roadsRouter.get('/:id', (req: Request, res: Response) => {
  const data = loadMockRoads();
  const road = (data.roads || []).find((r: { id: string }) => r.id === req.params.id);

  if (!road) {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROAD_NOT_FOUND',
        message: `Road segment with ID '${req.params.id}' not found`,
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: road,
    meta: {
      source: 'metro-road-network',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
    },
  });
});
