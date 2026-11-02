import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  skipInTests?: boolean;
}

/**
 * Lightweight, in-memory sliding-window rate limiter middleware.
 * Prevents denial of service, API abuse, and brute-force scanning.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetTime: number }>();

  // Cleanup expired entries every minute
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits.entries()) {
      if (now > entry.resetTime) {
        hits.delete(ip);
      }
    }
  }, 60000);

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (options.skipInTests && process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    // Health and version checks must always be accessible across networks
    if (
      req.path === '/health' ||
      req.path === '/api/v1/health' ||
      req.path === '/api/v1/version' ||
      req.path.startsWith('/health/') ||
      req.path.startsWith('/api/v1/health/')
    ) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || now > entry.resetTime) {
      hits.set(ip, { count: 1, resetTime: now + options.windowMs });
      res.setHeader('RateLimit-Limit', options.max);
      res.setHeader('RateLimit-Remaining', options.max - 1);
      res.setHeader('RateLimit-Reset', Math.ceil((now + options.windowMs) / 1000));
      return next();
    }

    if (entry.count >= options.max) {
      res.setHeader('RateLimit-Limit', options.max);
      res.setHeader('RateLimit-Remaining', 0);
      res.setHeader('RateLimit-Reset', Math.ceil(entry.resetTime / 1000));
      res.status(429).json({
        type: 'https://smartcity-guardian.org/errors/rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        detail: options.message || 'Rate limit exceeded. Please wait before making more requests.',
        instance: req.originalUrl || req.url,
        requestId: req.id,
      });
      return;
    }

    entry.count += 1;
    res.setHeader('RateLimit-Limit', options.max);
    res.setHeader('RateLimit-Remaining', Math.max(0, options.max - entry.count));
    res.setHeader('RateLimit-Reset', Math.ceil(entry.resetTime / 1000));
    next();
  };
}
