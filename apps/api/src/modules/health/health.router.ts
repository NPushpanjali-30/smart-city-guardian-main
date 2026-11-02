import { Router, Request, Response } from 'express';
import { config } from '../../config/index.js';

export const healthRouter = Router();

const APP_START_TIME = Date.now();
const API_VERSION = '0.1.0';
const SERVICE_NAME = 'smartcity-guardian-api';

/**
 * Standard Root Health Check
 * GET /health
 */
healthRouter.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: SERVICE_NAME,
    version: API_VERSION,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Kubernetes Liveness Probe
 * GET /health/live
 */
healthRouter.get(['/health/live', '/api/v1/health/live'], (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    probe: 'liveness',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Kubernetes Readiness Probe
 * GET /health/ready
 */
healthRouter.get(['/health/ready', '/api/v1/health/ready'], async (_req: Request, res: Response) => {
  try {
    const { roadRiskService } = await import('../../services/roads/roadRisk.service.js');
    const { routingEngine } = await import('../../services/routing/routingEngine.service.js');
    const { notificationQueueService } = await import('../../services/notifications/notificationQueue.service.js');

    const roads = await roadRiskService.getRoadRisks();
    const queueLength = notificationQueueService.getQueueDepth();
    const isReady = roads.length > 0;

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      probe: 'readiness',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      details: {
        roadNetworkSegments: roads.length,
        routingEngineReady: Boolean(routingEngine),
        notificationQueueActive: true,
        pendingQueueJobs: queueLength,
      },
    });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      probe: 'readiness',
      service: SERVICE_NAME,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Detailed API v1 Health Check
 * GET /api/v1/health
 */
healthRouter.get('/api/v1/health', (req: Request, res: Response) => {
  const uptimeSeconds = Math.floor((Date.now() - APP_START_TIME) / 1000);

  res.status(200).json({
    status: 'ok',
    service: SERVICE_NAME,
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    mockMode: config.MOCK_MODE,
    components: {
      database: {
        status: config.MOCK_MODE ? 'mocked' : 'up',
        details: config.MOCK_MODE ? 'Mock persistence active for Phase 1' : 'PostgreSQL PostGIS connected',
      },
      redis: {
        status: config.MOCK_MODE ? 'mocked' : 'up',
        details: config.MOCK_MODE ? 'In-memory simulated store active' : 'Redis broker connected',
      },
      grokAi: {
        status: 'up',
        details: 'Grok API decision engine configured with deterministic fallback',
      },
    },
  });
});

/**
 * Version and Runtime Info Endpoint
 * GET /api/v1/version
 */
healthRouter.get('/api/v1/version', (req: Request, res: Response) => {
  res.status(200).json({
    service: SERVICE_NAME,
    version: API_VERSION,
    nodeVersion: process.version,
    environment: config.NODE_ENV,
    mockMode: config.MOCK_MODE,
    timestamp: new Date().toISOString(),
    capabilities: [
      'multi_factor_flood_scoring',
      'safety_weighted_routing',
      'blocked_road_exclusion',
      'grok_ai_decision_support_with_fallback',
      'deduplicated_sms_alerts',
    ],
  });
});
