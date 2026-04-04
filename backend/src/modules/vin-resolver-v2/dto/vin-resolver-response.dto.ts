export type VinStatus = 'ACTIVE_AUCTION' | 'AUCTION_FINISHED' | 'HISTORICAL_RECORD' | 'NOT_FOUND';
export type DealStatus = 'EXCELLENT_DEAL' | 'GOOD_DEAL' | 'FAIR_DEAL' | 'RISKY' | 'OVERPRICED' | 'UNKNOWN';

export class VinResolverResponseDto {
  vin: string;
  status: VinStatus;
  confidence: number;

  vehicle: {
    title?: string;
    year?: number;
    make?: string;
    model?: string;
    lotNumber?: string;
    location?: string;
    saleDate?: string;
    price?: number;
    images: string[];
    damageType?: string;
    mileage?: number;
  };

  pricing?: {
    marketPrice: number;
    maxBid: number;
    safeBid: number;
    breakEvenBid: number;
    finalAllInPrice: number;
    dealStatus: DealStatus;
    platformMargin: number;
    deliveryCost: number;
    repairEstimate: number;
  };

  sourcesUsed: string[];
  sourceCount: number;
  searchDurationMs: number;
  message: string;
}
