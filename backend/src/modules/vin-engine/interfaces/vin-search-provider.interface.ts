/**
 * VIN Search Provider Interface
 * 
 * Єдиний інтерфейс для всіх провайдерів пошуку VIN
 * (DB, Web Search, Competitor, Aggregator)
 */

export type VinSearchCandidate = {
  vin: string;
  title?: string;
  price?: number | null;
  images?: string[];
  saleDate?: Date | null;
  sourceName: string;
  sourceUrl?: string;
  isAuction?: boolean;
  lotNumber?: string;
  location?: string;
  mileage?: string;
  make?: string;
  model?: string;
  year?: number;
  damageType?: string;
  confidence?: number;
  raw?: any;
};

export interface VinSearchContext {
  vin: string;
  skipCache?: boolean;
}

export interface VinSearchProvider {
  readonly name: string;
  readonly priority: number; // Lower = higher priority
  search(context: VinSearchContext): Promise<VinSearchCandidate[]>;
}
