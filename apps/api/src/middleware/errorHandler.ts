import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

import { sanitizeSecrets } from '../utils/sanitizer.js';

export interface HttpProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId?: string;
  errors?: unknown;
}

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const requestId = req.id;
  const instance = req.originalUrl || req.url;

  if (err instanceof ZodError) {
    const problem: HttpProblemDetails = {
      type: 'https://smartcity-guardian.org/errors/validation-error',
      title: 'Request Validation Error',
      status: 400,
      detail: 'The provided request payload failed strict schema validation.',
      instance,
      requestId,
      errors: err.format(),
    };

    logger.warn('Validation error encountered', { requestId, details: { errors: err.format() } });
    res.status(400).contentType('application/problem+json').json(problem);
    return;
  }

  const status = (err as { status?: number }).status || 500;
  const isInternal = status === 500;

  const sanitizedMessage = sanitizeSecrets(err.message || 'An error occurred');

  const problem: HttpProblemDetails = {
    type: 'https://smartcity-guardian.org/errors/internal-server-error',
    title: isInternal ? 'Internal Server Error' : err.name,
    status,
    detail: isInternal ? 'An unexpected internal error occurred. Please contact support.' : sanitizedMessage,
    instance,
    requestId,
  };

  logger.error('Unhandled application exception', { requestId, operation: `${req.method} ${instance}` }, err);
  res.status(status).contentType('application/problem+json').json(problem);
}
