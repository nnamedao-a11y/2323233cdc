/**
 * Base Fallback Adapter
 * 
 * All fallback/aggregator sources inherit from this.
 * Provides:
 * - Timeout control
 * - VIN normalization
 * - Error handling
 * - Structured result format
 */

export interface FallbackSourceResult {
  source: string;
  success: boolean;
  vinQueried: string;
  matchedVin: string | null;
  lotNumber?: string | null;
  auctionName?: string | null;
  price?: number | null;
  odometer?: number | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  damageType?: string | null;
  images?: string[];
  sourceUrl?: string | null;
  durationMs: number;
  raw?: any;
  error?: string;
}

export abstract class BaseFallbackAdapter {
  abstract readonly source: string;
  abstract readonly enabled: boolean;

  async resolve(vin: string): Promise<FallbackSourceResult> {
    const started = Date.now();

    try {
      const data = await this.scrape(vin);
      const matchedVin = data.vin ? this.normalizeVin(data.vin) : null;

      return {
        source: this.source,
        success: !!matchedVin,
        vinQueried: vin,
        matchedVin,
        lotNumber: data.lotNumber ?? null,
        auctionName: data.auctionName ?? null,
        price: data.price ?? null,
        odometer: data.odometer ?? null,
        year: data.year ?? null,
        make: data.make ?? null,
        model: data.model ?? null,
        damageType: data.damageType ?? null,
        images: data.images ?? [],
        sourceUrl: data.sourceUrl ?? null,
        durationMs: Date.now() - started,
        raw: data,
      };
    } catch (e) {
      return {
        source: this.source,
        success: false,
        vinQueried: vin,
        matchedVin: null,
        durationMs: Date.now() - started,
        error: e instanceof Error ? e.message : 'fallback error',
      };
    }
  }

  protected normalizeVin(vin: string): string {
    return (vin || '').trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  }

  protected abstract scrape(vin: string): Promise<any>;
}
