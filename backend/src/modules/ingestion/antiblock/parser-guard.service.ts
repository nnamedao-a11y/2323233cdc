/**
 * Parser Guard Service
 * 
 * Wraps parser execution with circuit breaker and health tracking
 */

import { Injectable } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ParserHealthService } from './parser-health.service';

@Injectable()
export class ParserGuardService {
  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly parserHealth: ParserHealthService,
  ) {}

  async runGuarded<T>(
    parserId: string,
    parserName: string,
    task: () => Promise<T>,
  ): Promise<{ success: boolean; result?: T; error?: string; skipped?: boolean }> {
    // Check circuit breaker
    if (!this.circuitBreaker.canExecute(parserId)) {
      console.log(`[ParserGuard] ${parserId} skipped (circuit open)`);
      return { 
        success: false, 
        skipped: true, 
        error: 'Circuit breaker open' 
      };
    }

    const startTime = Date.now();

    try {
      const result = await task();
      const durationMs = Date.now() - startTime;

      this.circuitBreaker.recordSuccess(parserId);
      
      // Determine fetched count if result has items
      const fetched = Array.isArray(result) ? result.length : 
                      (result as any)?.fetched || 
                      (result as any)?.items?.length || 0;
      
      this.parserHealth.markSuccess(parserId, { 
        parserName, 
        fetched,
        durationMs,
      });

      return { success: true, result };
      
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.circuitBreaker.recordFailure(parserId);
      this.parserHealth.markFailure(parserId, errorMessage, {
        parserName,
        durationMs,
      });

      console.error(`[ParserGuard] ${parserId} failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Run multiple parsers with guarding
   */
  async runMultipleGuarded<T>(
    parsers: Array<{
      id: string;
      name: string;
      run: () => Promise<T>;
    }>,
    options?: {
      concurrency?: number;
      stopOnFirstError?: boolean;
    }
  ): Promise<Array<{ parserId: string; success: boolean; result?: T; error?: string }>> {
    const results: Array<{ parserId: string; success: boolean; result?: T; error?: string }> = [];
    const concurrency = options?.concurrency || 3;

    // Process in batches
    for (let i = 0; i < parsers.length; i += concurrency) {
      const batch = parsers.slice(i, i + concurrency);
      
      const batchResults = await Promise.all(
        batch.map(async (parser) => {
          const result = await this.runGuarded(parser.id, parser.name, parser.run);
          return { parserId: parser.id, ...result };
        })
      );

      results.push(...batchResults);

      if (options?.stopOnFirstError && batchResults.some(r => !r.success && !r.skipped)) {
        break;
      }
    }

    return results;
  }
}
