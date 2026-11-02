import { logger } from '../../utils/logger.js';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // consecutive failures to trip (default: 5)
  resetTimeoutMs?: number;   // time before half-open probe (default: 30000)
  requestTimeoutMs?: number; // per-request timeout (default: 5000)
  maxRetries?: number;       // retry attempts on transient failure (default: 2)
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private static registry = new Map<string, CircuitBreaker>();

  public static get(name: string): CircuitBreaker | undefined {
    return CircuitBreaker.registry.get(name);
  }

  public static getAll(): CircuitBreaker[] {
    return Array.from(CircuitBreaker.registry.values());
  }

  private name: string;
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private options: Required<CircuitBreakerOptions>;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeoutMs: options.resetTimeoutMs ?? 30000,
      requestTimeoutMs: options.requestTimeoutMs ?? 5000,
      maxRetries: options.maxRetries ?? 2,
    };
    CircuitBreaker.registry.set(this.name, this);
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.options.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker [${this.name}] transitioned to HALF_OPEN probe state`);
      }
    }
    return this.state;
  }

  public trip(reason = 'Manual administrative override'): void {
    this.state = 'OPEN';
    this.lastFailureTime = Date.now();
    logger.warn(`Circuit breaker [${this.name}] manually TRIPPED to OPEN: ${reason}`);
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    logger.info(`Circuit breaker [${this.name}] manually RESET to CLOSED`);
  }

  public getName(): string {
    return this.name;
  }

  public async execute<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      throw new Error(`CircuitBreaker [${this.name}] is OPEN (fast fail)`);
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.options.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timeoutId);
        this.onSuccess();
        return result;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt <= this.options.maxRetries) {
          // Exponential backoff with jitter: min(3000, 300 * 2^attempt) + jitter
          const backoff = Math.min(3000, 300 * Math.pow(2, attempt)) + Math.floor(Math.random() * 150);
          logger.warn(`Circuit breaker [${this.name}] attempt ${attempt} failed, retrying in ${backoff}ms...`, {
            details: { error: lastError.message },
          });
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    this.onFailure(lastError!);
    throw lastError!;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.successCount = 0;
        logger.info(`Circuit breaker [${this.name}] successfully recovered and is now CLOSED`);
      }
    }
  }

  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'CLOSED' && this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      logger.error(`Circuit breaker [${this.name}] TRIPPED to OPEN state after ${this.failureCount} consecutive failures`, {
        details: { error: error.message },
      });
    } else if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker [${this.name}] probe failed in HALF_OPEN, returned to OPEN state`, {
        details: { error: error.message },
      });
    }
  }
}
