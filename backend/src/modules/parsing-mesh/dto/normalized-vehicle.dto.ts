/**
 * Normalized Vehicle DTO
 * 
 * Єдиний формат для всіх результатів парсингу
 */

export class NormalizedVehicleDto {
  vin: string;
  lotNumber?: string;
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  price?: number;
  saleDate?: Date;
  location?: string;
  mileage?: number;
  damage?: string;
  damageSecondary?: string;
  driveType?: string;
  fuelType?: string;
  transmission?: string;
  engineSize?: string;
  color?: string;
  keys?: boolean;
  source: string;
  sourceUrl: string;
  images: string[];
  isAuction: boolean;
  confidence: number;
  extractedAt: Date;
  rawMeta?: Record<string, any>;
}

export class SearchResultDto {
  url: string;
  html?: string;
  json?: any;
  title?: string;
  snippet?: string;
  source: string;
}

export class MergedVehicleDto extends NormalizedVehicleDto {
  sourcesCount: number;
  allSources: string[];
  allSourceUrls: string[];
  allImages: string[];
  priceHistory: { price: number; source: string; date: Date }[];
  fieldConfidence: Record<string, number>;
}
