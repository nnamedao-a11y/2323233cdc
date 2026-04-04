/**
 * Retry & Fallback Utilities
 * 
 * Решает проблему: любой апдейт сайта = 0 данных
 * - Retry logic с exponential backoff
 * - Fallback между методами
 * - Circuit breaker pattern
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryOn?: (error: any) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryOn: () => true,
};

/**
 * Выполнить функцию с retry и exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Проверяем, нужно ли retry для этой ошибки
      if (!opts.retryOn(error)) {
        throw error;
      }

      if (attempt < opts.maxAttempts) {
        console.log(`[Retry] Attempt ${attempt}/${opts.maxAttempts} failed: ${error.message}`);
        console.log(`[Retry] Waiting ${delay}ms before retry...`);
        
        await sleep(delay);
        
        // Exponential backoff
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
      }
    }
  }

  console.log(`[Retry] All ${opts.maxAttempts} attempts failed`);
  throw lastError;
}

/**
 * Выполнить с fallback - если primary падает, пробуем fallback
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  options: {
    primaryName?: string;
    fallbackName?: string;
    validateResult?: (result: T) => boolean;
  } = {},
): Promise<{ result: T; usedFallback: boolean; error?: string }> {
  const primaryName = options.primaryName || 'primary';
  const fallbackName = options.fallbackName || 'fallback';
  const validate = options.validateResult || (() => true);

  try {
    console.log(`[Fallback] Trying ${primaryName}...`);
    const result = await primary();
    
    if (!validate(result)) {
      throw new Error(`${primaryName} returned invalid result`);
    }
    
    console.log(`[Fallback] ${primaryName} succeeded`);
    return { result, usedFallback: false };
  } catch (primaryError) {
    console.log(`[Fallback] ${primaryName} failed: ${primaryError.message}`);
    console.log(`[Fallback] Trying ${fallbackName}...`);
    
    try {
      const result = await fallback();
      
      if (!validate(result)) {
        throw new Error(`${fallbackName} returned invalid result`);
      }
      
      console.log(`[Fallback] ${fallbackName} succeeded`);
      return {
        result,
        usedFallback: true,
        error: `${primaryName} failed: ${primaryError.message}`,
      };
    } catch (fallbackError) {
      console.log(`[Fallback] ${fallbackName} also failed: ${fallbackError.message}`);
      throw new Error(
        `Both ${primaryName} and ${fallbackName} failed. ` +
        `Primary: ${primaryError.message}. Fallback: ${fallbackError.message}`
      );
    }
  }
}

/**
 * Circuit Breaker - предотвращает повторные вызовы при частых ошибках
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly name: string,
    private readonly options: {
      failureThreshold?: number;
      resetTimeout?: number;
    } = {},
  ) {}

  private get failureThreshold(): number {
    return this.options.failureThreshold || 5;
  }

  private get resetTimeout(): number {
    return this.options.resetTimeout || 60000; // 1 minute
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Проверяем, прошло ли достаточно времени для retry
      if (Date.now() - (this.lastFailure || 0) > this.resetTimeout) {
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      
      // Успех - сбрасываем счётчик
      if (this.state === 'HALF_OPEN') {
        console.log(`[CircuitBreaker:${this.name}] Success in HALF_OPEN, closing circuit`);
        this.state = 'CLOSED';
      }
      this.failures = 0;
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      
      if (this.failures >= this.failureThreshold) {
        console.log(`[CircuitBreaker:${this.name}] Threshold reached (${this.failures}), opening circuit`);
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }

  getStatus(): { state: string; failures: number; lastFailure: number | null } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }

  reset(): void {
    this.failures = 0;
    this.lastFailure = null;
    this.state = 'CLOSED';
  }
}

/**
 * Rate limiter - ограничение частоты вызовов
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Удаляем старые timestamps
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    
    if (this.timestamps.length >= this.maxRequests) {
      // Ждём до освобождения слота
      const oldestTimestamp = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestTimestamp);
      
      if (waitTime > 0) {
        console.log(`[RateLimiter] Waiting ${waitTime}ms...`);
        await sleep(waitTime);
      }
      
      // Очищаем и добавляем новый
      this.timestamps = this.timestamps.filter(t => Date.now() - t < this.windowMs);
    }
    
    this.timestamps.push(Date.now());
  }
}

/**
 * Вспомогательная функция sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry-specific error predicates
 */
export const retryPredicates = {
  // Retry на сетевые ошибки
  onNetworkError: (error: any) => {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket hang up')
    );
  },

  // Retry на 5xx ошибки
  on5xxError: (error: any) => {
    const status = error.response?.status || error.status;
    return status >= 500 && status < 600;
  },

  // Retry на rate limit (429)
  onRateLimit: (error: any) => {
    const status = error.response?.status || error.status;
    return status === 429;
  },

  // Комбинированный predicate
  onTransientError: (error: any) => {
    return (
      retryPredicates.onNetworkError(error) ||
      retryPredicates.on5xxError(error) ||
      retryPredicates.onRateLimit(error)
    );
  },
};
