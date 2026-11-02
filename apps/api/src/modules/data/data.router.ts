import { Router, Request, Response } from 'express';
import { liveStateStore } from '../../services/stateStore.js';
import { dataAggregator } from '../../services/dataAggregator.js';

export const dataRouter = Router();

/**
 * GET /api/v1/data/providers/status
 * Exposes health, latency, failure counts, and live/mock status for all data adapters.
 */
dataRouter.get('/providers/status', (req: Request, res: Response) => {
  const statuses = liveStateStore.getAllProviderStatuses();

  res.status(200).json({
    success: true,
    data: statuses,
    meta: {
      source: 'smartcity-telemetry-monitor',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
    },
  });
});

/**
 * GET /api/v1/realtime/state
 * Returns a consolidated snapshot of the current city intelligence state.
 */
dataRouter.get('/realtime/state', async (req: Request, res: Response) => {
  try {
    const [weather, traffic, flood] = await Promise.all([
      dataAggregator.refreshWeather().catch(() => null),
      dataAggregator.refreshTraffic().catch(() => ({ flows: [], incidents: [] })),
      dataAggregator.refreshFlood().catch(() => []),
    ]);

    const providerStatuses = liveStateStore.getAllProviderStatuses();

    res.status(200).json({
      success: true,
      data: {
        weather,
        traffic,
        flood,
        providers: providerStatuses,
      },
      meta: {
        source: 'smartcity-aggregator',
        retrievedAt: new Date().toISOString(),
        freshness: weather?.freshness || 'LIVE',
        isMock: weather?.freshness === 'MOCK',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATE_RETRIEVAL_FAILED',
        message: `Failed to compile realtime city state: ${msg}`,
      },
    });
  }
});
