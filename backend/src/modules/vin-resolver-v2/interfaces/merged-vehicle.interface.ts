export interface MergedVehicle {
  vin: string;
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
  confidence: number;
  sourcesUsed: string[];
  sourceCount: number;
}
