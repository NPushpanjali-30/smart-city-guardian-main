import { Router, Request, Response } from 'express';
import { dataAggregator } from '../../services/dataAggregator.js';

export const weatherRouter = Router();

/**
 * GET /api/v1/weather/current
 */
weatherRouter.get('/current', async (req: Request, res: Response) => {
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : 40.7128;
  const lon = req.query.lon !== undefined ? Number(req.query.lon) : -74.0060;

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_COORDINATES',
        message: 'Valid latitude [-90, 90] and longitude [-180, 180] required',
      },
    });
  }

  try {
    const observation = await dataAggregator.refreshWeather(lat, lon);

    res.status(200).json({
      success: true,
      data: observation,
      meta: {
        source: observation.source,
        retrievedAt: observation.receivedAt,
        freshness: observation.freshness,
        dataAgeSeconds: observation.dataAgeSeconds,
        isMock: observation.freshness === 'MOCK',
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      success: false,
      error: {
        code: 'WEATHER_UNAVAILABLE',
        message: `Weather provider failure: ${msg}`,
      },
    });
  }
});

/**
 * GET /api/v1/weather/forecast
 */
weatherRouter.get('/forecast', async (req: Request, res: Response) => {
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : 40.7128;
  const lon = req.query.lon !== undefined ? Number(req.query.lon) : -74.0060;

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_COORDINATES',
        message: 'Valid latitude [-90, 90] and longitude [-180, 180] required',
      },
    });
  }

  try {
    const forecasts = await dataAggregator.getForecast(lat, lon);

    res.status(200).json({
      success: true,
      data: forecasts,
      meta: {
        source: forecasts[0]?.source || 'weather-service',
        retrievedAt: new Date().toISOString(),
        freshness: forecasts[0]?.freshness || 'LIVE',
        isMock: forecasts[0]?.freshness === 'MOCK',
        correlationId: req.correlationId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      success: false,
      error: {
        code: 'FORECAST_UNAVAILABLE',
        message: `Forecast retrieval failure: ${msg}`,
      },
    });
  }
});
