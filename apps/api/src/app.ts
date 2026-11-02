import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimiter.js';

import { healthRouter } from './modules/health/health.router.js';
import { authRouter } from './modules/auth/auth.router.js';
import { weatherRouter } from './modules/weather/weather.router.js';
import { trafficRouter } from './modules/traffic/traffic.router.js';
import { floodsRouter } from './modules/floods/floods.router.js';
import { roadsRouter } from './modules/roads/roads.router.js';
import { routingRouter } from './modules/routing/routing.router.js';
import { aiRouter } from './modules/ai/ai.router.js';
import { alertsRouter } from './modules/alerts/alerts.router.js';
import { reportsRouter } from './modules/reports/reports.router.js';
import { adminRouter } from './modules/admin/admin.router.js';
import { dataRouter } from './modules/data/data.router.js';
import { locationRouter } from './modules/location/location.router.js';
import { pushRouter } from './modules/push/push.router.js';
import { versionRouter } from './modules/version/version.router.js';
import { facilitiesRouter } from './modules/facilities/facilities.router.js';


export function createApp(): Express {
  const app = express();

  // Explicit, whitelist-based CORS validation
  const allowedOrigins = (config.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow mobile clients, CLI/tests, or server-to-server calls with no Origin header
        if (!requestOrigin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked for unauthorized origin: ${requestOrigin}`));
      },
      credentials: true,
    })
  );
  app.use(express.json());

  // Standard Security Headers (Helmet-equivalent)
  app.use((_req: Request, res: Response, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss: https:;"
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Core Health & Version Endpoints (Always open & zero-delay for mobile apps & monitors)
  app.use('/', healthRouter);

  // Global DDoS and Brute-Force Rate Limiting
  app.use(
    createRateLimiter({
      windowMs: 60 * 1000,
      max: 300,
      skipInTests: true,
      message: 'Too many API requests from this client. Please slow down.',
    })
  );

  // Observability & Request Tracing
  app.use(requestLoggerMiddleware);

  // Global Identity & Token Parser
  app.use(authenticate);

  // Strict Authentication Rate Limiter (Prevent brute-force login attempts)
  const authRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    skipInTests: true,
    message: 'Too many authentication attempts. Please wait 1 minute before retrying.',
  });

  // Domain Module Routes
  app.use('/api/v1/auth', authRateLimiter, authRouter);
  app.use('/api/v1/weather', weatherRouter);
  app.use('/api/v1/traffic', trafficRouter);
  app.use('/api/v1/floods', floodsRouter);
  app.use('/api/v1/flood', floodsRouter); // singular alias
  app.use('/api/v1/roads', roadsRouter);
  app.use('/api/v1/routing', routingRouter);
  app.use('/api/v1/routes', routingRouter);
  app.use('/api/v1/ai', aiRouter);
  app.use('/api/v1/alerts', alertsRouter);
  app.use('/api/v1/notifications', alertsRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/data', dataRouter);
  app.use('/api/v1/realtime', dataRouter);
  app.use('/api/v1/location', locationRouter);
  app.use('/api/v1/facilities', facilitiesRouter);
  app.use('/api/v1/push', pushRouter);
  app.use('/api/v1/app', versionRouter);
  app.use('/version', versionRouter);

  // 404 Catch-All
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      type: 'https://smartcity-guardian.org/errors/not-found',
      title: 'Resource Not Found',
      status: 404,
      detail: `Route ${req.method} ${req.originalUrl || req.url} does not exist.`,
      instance: req.originalUrl || req.url,
      requestId: req.id,
    });
  });

  // Centralized Problem Details Error Handler
  app.use(errorHandlerMiddleware);

  return app;
}
