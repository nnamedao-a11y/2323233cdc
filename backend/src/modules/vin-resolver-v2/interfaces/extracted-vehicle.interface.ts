export interface ExtractedVehicle {
  vin: string;
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  lotNumber?: string;
  location?: string;
  saleDate?: string;
  price?: number;
  images?: string[];
  damageType?: string;
  mileage?: number;
  source: string;
  sourceUrl: string;
  confidence: number;
  rawMeta?: Record<string, any>;
}
