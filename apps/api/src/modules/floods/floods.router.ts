import { Router, Request, Response } from 'express';
import { floodIntelligenceService } from '../../services/flood/floodIntelligence.service.js';
import { dataAggregator } from '../../services/dataAggregator.js';

export const floodsRouter = Router();

/**
 * GET /api/v1/flood/risk & GET /api/v1/floods/risk
 */
floodsRouter.get('/risk', async (req: Request, res: Response) => {
  try {
    const rainfallRate = req.query.rainfall ? Number(req.query.rainfall) : undefined;
    const isFloodProne = req.query.floodProne !== undefined ? req.query.floodProne === 'true' : undefined;

    let customWeather;
    if (typeof rainfallRate === 'number' && !isNaN(rainfallRate)) {
      customWeather = {
        id: 'weather-query-override',
        source: 'user-query',
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        location: { name: 'Metro Central', latitude: 40.7128, longitude: -74.006 },
        temperatureC: 21.5,
        humidityPercent: 92.0,
        rainfallRateMmh: rainfallRate,
        rainfall1hMm: rainfallRate * 0.8,
        rainfall24hMm: rainfallRate * 2.2,
        windSpeedKmh: 30.0,
        freshness: 'LIVE' as const,
        dataAgeSeconds: 10,
      };
    }

    const evaluation = await floodIntelligenceService.evaluateRisk({
      weatherObservation: customWeather,
      isHistoricallyFloodProne: isFloodProne,
    });

    res.status(200).json({
      success: true,
      data: {
        area: 'Metro Central',
        current: {
          score: evaluation.currentRisk.compositeScore,
          state: evaluation.currentRisk.severity,
          factors: evaluation.currentRisk.factors,
          humanSummary: evaluation.currentRisk.humanSummary,
        },
        prediction: {
          horizonMinutes: evaluation.prediction.predictionHorizonMinutes,
          state: evaluation.prediction.predictedState,
          probability: evaluation.prediction.probability,
          trend: evaluation.prediction.trend,
          reasons: evaluation.prediction.reasons,
          modelVersion: evaluation.prediction.modelVersion,
        },
        confidence: evaluation.currentRisk.confidence,
        latencyMs: evaluation.processingLatencyMs,
        updatedAt: evaluation.evaluatedAt,
      },
      meta: {
        source: 'smartcity-flood-intelligence-engine',
        retrievedAt: new Date().toISOString(),
        freshness: evaluation.features.dataFreshnessState,
        isMock: false,
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FLOOD_RISK_EVALUATION_FAILED',
        message: `Failed to evaluate flood risk: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/flood/risk/:areaId
 */
floodsRouter.get('/risk/:areaId', async (req: Request, res: Response) => {
  const evaluation = await floodIntelligenceService.evaluateRisk();
  const zone = evaluation.zones.find(
    (z) => z.zoneId.toLowerCase() === req.params.areaId.toLowerCase()
  );

  if (!zone) {
    res.status(404).json({
      success: false,
      error: {
        code: 'ZONE_NOT_FOUND',
        message: `Flood risk zone '${req.params.areaId}' not found`,
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      zone,
      cityRisk: {
        score: evaluation.currentRisk.compositeScore,
        state: evaluation.currentRisk.severity,
      },
      prediction: evaluation.prediction,
      confidence: zone.confidence,
      updatedAt: zone.updatedAt,
    },
    meta: {
      source: 'smartcity-flood-intelligence-engine',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
    },
  });
});

/**
 * GET /api/v1/flood/predictions & GET /api/v1/floods/predictions
 */
floodsRouter.get('/predictions', async (req: Request, res: Response) => {
  const horizon = req.query.horizon ? Number(req.query.horizon) : 30;
  const evaluation = await floodIntelligenceService.evaluateRisk();

  res.status(200).json({
    success: true,
    data: {
      activePrediction: {
        ...evaluation.prediction,
        predictionHorizonMinutes: horizon,
      },
      featuresSummary: {
        rainfallRate: evaluation.features.rainfallRateMmh,
        rainfallTrend: evaluation.features.rainfallTrend,
        rainfallAcceleration: evaluation.features.rainfallAcceleration,
        forecastIntensity: evaluation.features.forecastIntensity,
        reportClusterWeight: evaluation.features.reportSpatialClusterWeight,
      },
    },
    meta: {
      source: 'short-horizon-predictor',
      retrievedAt: new Date().toISOString(),
      freshness: evaluation.features.dataFreshnessState,
      isMock: false,
      modelVersion: evaluation.prediction.modelVersion,
    },
  });
});

/**
 * GET /api/v1/flood/events & GET /api/v1/floods/events
 */
floodsRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const observations = await dataAggregator.refreshFlood();
    const evaluation = await floodIntelligenceService.evaluateRisk();

    res.status(200).json({
      success: true,
      data: {
        activeBasins: observations,
        currentState: evaluation.currentRisk.severity,
        currentScore: evaluation.currentRisk.compositeScore,
        prediction: evaluation.prediction,
        affectedZonesCount: evaluation.zones.filter((z) => z.severity !== 'NORMAL').length,
      },
      meta: {
        source: observations[0]?.source || 'metro-flood-adapter',
        retrievedAt: new Date().toISOString(),
        freshness: observations[0]?.freshness || 'MOCK',
        dataAgeSeconds: observations[0]?.dataAgeSeconds || 0,
        isMock: observations[0]?.freshness === 'MOCK',
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      success: false,
      error: {
        code: 'FLOOD_EVENTS_UNAVAILABLE',
        message: `Flood provider failure: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/flood/zones & GET /api/v1/floods/zones
 */
floodsRouter.get('/zones', async (req: Request, res: Response) => {
  const evaluation = await floodIntelligenceService.evaluateRisk();
  res.status(200).json({
    success: true,
    data: evaluation.zones,
    meta: {
      source: 'smartcity-flood-geospatial-engine',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
      totalZones: evaluation.zones.length,
    },
  });
});

/**
 * GET /api/v1/flood/history
 */
floodsRouter.get('/history', (req: Request, res: Response) => {
  const history = floodIntelligenceService.getPredictionHistory();
  res.status(200).json({
    success: true,
    data: history,
    meta: {
      source: 'flood-prediction-audit-log',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
      recordsCount: history.length,
    },
  });
});

/**
 * GET /api/v1/flood/ai-context
 */
floodsRouter.get('/ai-context', async (req: Request, res: Response) => {
  const evaluation = await floodIntelligenceService.evaluateRisk();
  res.status(200).json({
    success: true,
    data: evaluation.aiContext,
    meta: {
      source: 'flood-ai-context-builder',
      retrievedAt: new Date().toISOString(),
      freshness: 'LIVE',
      isMock: false,
      purpose: 'Phase 4 Grok Decision Engine Context Envelope',
    },
  });
});

/**
 * GET /api/v1/floods/state & GET /api/v1/flood/state
 */
floodsRouter.get('/state', async (req: Request, res: Response) => {
  try {
    const evaluation = await floodIntelligenceService.evaluateRisk();
    res.status(200).json({
      success: true,
      data: {
        severity: evaluation.currentRisk.severity,
        compositeScore: evaluation.currentRisk.compositeScore,
        confidence: evaluation.currentRisk.confidence,
        humanSummary: evaluation.currentRisk.humanSummary,
        factors: evaluation.currentRisk.factors,
        prediction: evaluation.prediction,
        zonesCount: evaluation.zones.length,
        criticalZonesCount: evaluation.zones.filter((z) => z.severity === 'CRITICAL').length,
        warningZonesCount: evaluation.zones.filter((z) => z.severity === 'WARNING').length,
      },
      meta: {
        source: 'smartcity-flood-intelligence-engine',
        retrievedAt: new Date().toISOString(),
        freshness: evaluation.features.dataFreshnessState,
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FLOOD_STATE_ERROR',
        message: `Failed to retrieve flood state: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/floods/hotspots & GET /api/v1/flood/hotspots
 */
floodsRouter.get('/hotspots', async (req: Request, res: Response) => {
  try {
    const { locationRelevanceService } = await import('../../services/locationRelevance.service.js');
    const zones = locationRelevanceService.getActiveFloodZones();

    const hotspots = zones.map((z) => ({
      id: z.zoneId,
      name: z.zoneName,
      severity: z.severity,
      waterDepthCm: z.waterDepthCm,
      center: [z.centerLat, z.centerLon],
      criticalRainfallThresholdMmh: z.waterDepthCm >= 30 ? 16.0 : 25.0,
      vulnerability: z.severity === 'CRITICAL' ? 'EXTREME' : z.severity === 'WARNING' ? 'HIGH' : 'MODERATE',
    }));

    res.status(200).json({
      success: true,
      data: hotspots,
      hotspots,
      meta: {
        totalHotspots: hotspots.length,
        criticalHotspots: hotspots.filter((h) => h.severity === 'CRITICAL').length,
        retrievedAt: new Date().toISOString(),
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'HOTSPOTS_ERROR',
        message: `Failed to retrieve flood hotspots: ${msg}`,
      },
    });
  }
});

/**
 * POST /api/v1/floods/simulate & POST /api/v1/flood/simulate
 */
floodsRouter.post('/simulate', async (req: Request, res: Response) => {
  try {
    const rainfallRate = Number(req.body?.rainfallRate ?? req.body?.rainfall ?? 45.0);
    const waterDepthCm = Number(req.body?.waterDepthCm ?? 35.0);
    const scenario = req.body?.scenario || 'CUSTOM_SIMULATION';

    const customWeather = {
      id: `sim-${Date.now()}`,
      source: 'flood-simulation-engine',
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      location: { name: 'Metro Central Simulation Grid', latitude: 40.7128, longitude: -74.006 },
      temperatureC: 22.0,
      humidityPercent: 95.0,
      rainfallRateMmh: rainfallRate,
      rainfall1hMm: rainfallRate * 0.85,
      rainfall24hMm: rainfallRate * 2.5,
      windSpeedKmh: 40.0,
      freshness: 'LIVE' as const,
      dataAgeSeconds: 0,
    };

    const evaluation = await floodIntelligenceService.evaluateRisk({
      weatherObservation: customWeather,
      isHistoricallyFloodProne: true,
    });

    res.status(200).json({
      success: true,
      simulation: {
        scenario,
        injectedRainfallRateMmh: rainfallRate,
        simulatedWaterDepthCm: waterDepthCm,
        simulatedAt: new Date().toISOString(),
      },
      data: {
        severity: evaluation.currentRisk.severity,
        compositeScore: evaluation.currentRisk.compositeScore,
        prediction: evaluation.prediction,
        humanSummary: evaluation.currentRisk.humanSummary,
        impactedZones: evaluation.zones.filter((z) => z.severity !== 'NORMAL').length,
      },
      meta: {
        source: 'smartcity-flood-simulation-engine',
        simulated: true,
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: 'SIMULATION_ERROR',
        message: `Flood simulation failed: ${msg}`,
      },
    });
  }
});
