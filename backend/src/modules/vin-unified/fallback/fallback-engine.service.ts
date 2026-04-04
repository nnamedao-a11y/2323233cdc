/**
 * Fallback Layer Engine
 * 
 * Runs ONLY when CORE (Copart/IAAI) fails to find VIN.
 * Uses aggregators/competitors as backup sources.
 * 
 * KEY RULES:
 * 1. NEVER replaces CORE results
 * 2. Strict VIN validation (P0)
 * 3. Results marked as UNVERIFIED (verified: false)
 * 4. Lower trust score (confidence: 0.4 max)
 * 5. Data marked as sourceType: 'fallback'
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedVehicle } from '../dto/vin.dto';
import { BaseFallbackAdapter, FallbackSourceResult } from './base-fallback.adapter';
import { BidFaxFallbackAdapter } from './adapters/bidfax-fallback.adapter';
import { PoctraFallbackAdapter } from './adapters/poctra-fallback.adapter';
import { GoogleFallbackAdapter } from './adapters/google-fallback.adapter';

export interface FallbackResult {
  success: boolean;
  vehicle: ExtractedVehicle | null;
  sourceType: 'fallback';
  verified: false;
  sources: string[];
  durationMs: number;
}

@Injectable()
export class FallbackEngine {
  private readonly logger = new Logger(FallbackEngine.name);
  private readonly adapters: BaseFallbackAdapter[];

  constructor() {
    // Register all fallback adapters
    this.adapters = [
      new BidFaxFallbackAdapter(),
      new PoctraFallbackAdapter(),
      new GoogleFallbackAdapter(),
    ].filter(a => a.enabled);

    this.logger.log(`[Fallback] Registered ${this.adapters.length} adapters: ${this.adapters.map(a => a.source).join(', ')}`);
  }

  /**
   * Run fallback sources — ONLY when CORE fails
   */
  async run(vin: string): Promise<FallbackResult | null> {
    if (this.adapters.length === 0) {
      this.logger.debug('[Fallback] No adapters registered');
      return null;
    }

    const normalizedVin = this.normalizeVin(vin);
    const startTime = Date.now();

    this.logger.log(`[Fallback] Running ${this.adapters.length} adapters for VIN=${vin}`);

    // Run all adapters in parallel with per-adapter timeout
    const results = await Promise.allSettled(
      this.adapters.map(adapter =>
        this.withTimeout(adapter.resolve(vin), 15000, adapter.source)
      )
    );

    const successfulSources: string[] = [];
    const validResults: Array<{ source: string; data: FallbackSourceResult }> = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const adapter = this.adapters[i];

      if (result.status === 'fulfilled' && result.value.success) {
        const foundVin = this.normalizeVin(result.value.matchedVin || '');

        // P0 CRITICAL: Strict VIN validation
        if (foundVin === normalizedVin && foundVin.length === 17) {
          successfulSources.push(adapter.source);
          validResults.push({
            source: adapter.source,
            data: result.value,
          });
          this.logger.log(`[Fallback] Valid result from ${adapter.source}`);
        } else {
          this.logger.warn(
            `[Fallback] VIN mismatch from ${adapter.source}: ` +
            `expected=${normalizedVin}, got=${foundVin}`
          );
        }
      } else if (result.status === 'rejected') {
        this.logger.debug(`[Fallback] ${adapter.source} failed: ${result.reason}`);
      }
    }

    const duration = Date.now() - startTime;

    if (validResults.length === 0) {
      this.logger.log(`[Fallback] No valid results found (${duration}ms)`);
      return null;
    }

    // Pick best result (first valid for now — can be scored later)
    const best = validResults[0];

    const vehicle = this.mapToExtractedVehicle(normalizedVin, best.data);

    this.logger.log(
      `[Fallback] Found result from ${best.source} (${duration}ms), ` +
      `lot=${vehicle.lotNumber}, price=${vehicle.price}`
    );

    return {
      success: true,
      vehicle,
      sourceType: 'fallback',
      verified: false,
      sources: successfulSources,
      durationMs: duration,
    };
  }

  /**
   * Map fallback source result to ExtractedVehicle
   */
  private mapToExtractedVehicle(vin: string, data: FallbackSourceResult): ExtractedVehicle {
    return {
      vin,
      source: data.source,
      sourceUrl: data.sourceUrl || '',
      sourceTier: 3,
      lotNumber: data.lotNumber || undefined,
      price: data.price || undefined,
      mileage: data.odometer || undefined,
      year: data.year || undefined,
      make: data.make || undefined,
      model: data.model || undefined,
      damageType: data.damageType || undefined,
      title: data.year && data.make
        ? `${data.year} ${data.make} ${data.model || ''}`.trim()
        : undefined,
      images: data.images || [],
      confidence: 0.4, // Low confidence for fallback
      extractedAt: new Date(),
      responseTime: data.durationMs,
    };
  }

  private normalizeVin(vin: string): string {
    return (vin || '').trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
  }
}
