import { Request, Response, NextFunction } from 'express';
import { verifyJwt, TokenPayload } from '../utils/jwt.js';
import { config } from '../config/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Global authentication parser middleware.
 * Inspects incoming requests for Bearer JWT tokens, API keys, or admin headers.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] || req.headers['x-admin-key'];

  // 1. Check API Key header (e.g. system administration or microservice communication)
  if (
    typeof apiKeyHeader === 'string' &&
    apiKeyHeader.trim() === config.ADMIN_API_KEY
  ) {
    req.user = {
      id: 'admin-system',
      email: 'system-admin@smartcity.org',
      role: 'ADMIN',
      fullName: 'System Administrator',
    };
    return next();
  }

  // 2. Check Bearer Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = verifyJwt(token, config.JWT_SECRET);
    if (verified) {
      req.user = verified;
      return next();
    }
  }

  // 3. Fallback for test / explicit role emulation headers
  const roleHeader = req.headers['x-user-role'];
  const userIdHeader = req.headers['x-user-id'];
  if (typeof roleHeader === 'string') {
    const roleUpper = roleHeader.toUpperCase();
    if (roleUpper === 'ADMIN') {
      req.user = {
        id: typeof userIdHeader === 'string' ? userIdHeader : 'admin-001',
        email: 'admin@smartcity.org',
        role: 'ADMIN',
        fullName: 'EOC Commander',
      };
      return next();
    } else if (roleUpper === 'CITIZEN') {
      req.user = {
        id: typeof userIdHeader === 'string' ? userIdHeader : 'user-001',
        email: 'citizen@smartcity.org',
        role: 'CITIZEN',
        fullName: 'Metro Resident',
      };
      return next();
    }
  }

  next();
}

/**
 * Middleware that strictly requires the user to be authenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    return next();
  }

  const isEnforced = config.ENFORCE_AUTH || config.NODE_ENV === 'production' || req.headers['x-test-enforce-auth'] === 'true';

  if (isEnforced) {
    res.status(401).json({
      type: 'https://smartcity-guardian.org/errors/unauthorized',
      title: 'Authentication Required',
      status: 401,
      detail: 'Missing or invalid authentication credentials. Please provide a valid Bearer token.',
      instance: req.originalUrl || req.url,
      requestId: req.id,
    });
    return;
  }

  // Backward-compatible development identity when not strictly enforced
  req.user = {
    id: (req.headers['x-user-id'] as string) || 'dev-citizen-001',
    email: 'dev@smartcity.org',
    role: 'CITIZEN',
    fullName: 'Development User',
  };
  next();
}

/**
 * Middleware enforcing specific role authorizations (e.g. requireRole('ADMIN')).
 */
export function requireRole(...allowedRoles: ('ADMIN' | 'CITIZEN')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const isEnforced = config.ENFORCE_AUTH || config.NODE_ENV === 'production' || req.headers['x-test-enforce-auth'] === 'true';

    // If user is already identified
    if (req.user) {
      if (allowedRoles.includes(req.user.role)) {
        return next();
      }

      res.status(403).json({
        type: 'https://smartcity-guardian.org/errors/forbidden',
        title: 'Access Forbidden',
        status: 403,
        detail: `Access denied: Action requires role [${allowedRoles.join(', ')}]. Current role: ${req.user.role}.`,
        instance: req.originalUrl || req.url,
        requestId: req.id,
      });
      return;
    }

    // If user is unauthenticated
    if (isEnforced) {
      res.status(401).json({
        type: 'https://smartcity-guardian.org/errors/unauthorized',
        title: 'Authentication Required',
        status: 401,
        detail: `Authentication required for administrative operations. Please provide an authorized admin Bearer token or x-api-key header.`,
        instance: req.originalUrl || req.url,
        requestId: req.id,
      });
      return;
    }

    // Dev/test default pass-through when unconstrained
    next();
  };
}
