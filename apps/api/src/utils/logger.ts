export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  durationMs?: number;
  operation?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export class StructuredLogger {
  private serviceName: string;

  constructor(serviceName = 'smartcity-guardian-api') {
    this.serviceName = serviceName;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...(context?.requestId && { request_id: context.requestId }),
      ...(context?.correlationId && { correlation_id: context.correlationId }),
      ...(context?.durationMs !== undefined && { duration_ms: context.durationMs }),
      ...(context?.operation && { operation: context.operation }),
      ...(context?.details && { details: context.details }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    };

    const output = JSON.stringify(entry);

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log('warn', message, context, error);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.log('error', message, context, error);
  }
}

export const logger = new StructuredLogger();
