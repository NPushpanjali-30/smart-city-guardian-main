import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      correlationId?: string;
      startTime?: number;
    }
  }
}

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.correlationId = (req.headers['x-correlation-id'] as string) || req.id;
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Correlation-Id', req.correlationId);

  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTime || Date.now());
    const isError = res.statusCode >= 400;

    const context = {
      requestId: req.id,
      correlationId: req.correlationId,
      durationMs,
      operation: `${req.method} ${req.originalUrl || req.url}`,
      details: {
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    };

    if (isError) {
      logger.warn(`HTTP Request Completed with Status ${res.statusCode}`, context);
    } else {
      logger.info(`HTTP Request Completed`, context);
    }
  });

  next();
}
