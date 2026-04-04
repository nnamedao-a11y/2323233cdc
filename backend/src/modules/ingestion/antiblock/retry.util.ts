/**
 * Retry Utilities
 * 
 * Exponential backoff with jitter to avoid thundering herd
 */

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

export async function withRetry<T>(
  task: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const retries = options?.retries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 800;
  const maxDelayMs = options?.maxDelayMs ?? 15_000;
  const jitterMs = options?.jitterMs ?? 500;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      
      if (attempt === retries) break;

      // Exponential backoff with jitter
      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * jitterMs);
      const delay = expDelay + jitter;

      if (options?.onRetry) {
        options.onRetry(error, attempt + 1);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Human-like pause (random delay)
 */
export function humanPause(minMs = 400, maxMs = 1200): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(delay);
}

/**
 * Rate limiting helper
 */
export class RateLimiter {
  private lastRequest = 0;
  
  constructor(private minIntervalMs: number = 1000) {}
  
  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    
    this.lastRequest = Date.now();
  }
}
