/**
 * VIN DTOs - 3-Layer Response Model
 * 
 * Layer 1: Vehicle (official decode) - NHTSA/vPIC
 * Layer 2: Auction (marketplace data) - Copart/IAAI/aggregators
 * Layer 3: Shipping (logistics) - requires shipping ID
 */

// ============ CONFIDENCE LEVELS ============
export type ConfidenceLevel = 'confirmed' | 'probable' | 'weak' | 'unavailable';

// ============ VEHICLE STATUS ============
export type VehicleStatus = 'NOT_FOUND' | 'PARTIAL' | 'FOUND' | 'AUCTION_ACTIVE' | 'SOLD' | 'ARCHIVED';

// ============ DEAL SCORE ============
export type DealScore = 'GOOD' | 'FAIR' | 'RISK' | 'BAD';

// ============ SOURCE TYPES (SCRAPING ONLY - NO API) ============
export type SourceType = 'json' | 'html_light' | 'html_heavy' | 'stealth' | 'competitor';
export type SourceTier = 1 | 2 | 3;

// ============ FALLBACK MODE ============
export type FallbackMode = 'disabled' | 'delayed' | 'parallel';

// ============ LAYER 1: VEHICLE (Official Decode) ============
export interface VehicleLayerDto {
  year: number | null;
  make: string | null;
  model: string | null;
  trim?: string;
  bodyType?: string;
  driveType?: string;
  fuelType?: string;
  engineSize?: string;
  transmission?: string;
  plantCountry?: string;
  plantCity?: string;
  manufacturerId?: string;
  confidence: ConfidenceLevel;
  source: 'NHTSA' | 'vPIC' | 'cache';
}

// ============ LAYER 2: AUCTION ============
export interface AuctionLayerDto {
  found: boolean;
  source: string | null;
  lotNumber: string | null;
  status: 'upcoming' | 'live' | 'sold' | 'cancelled' | null;
  saleDate: Date | null;
  location: string | null;
  currentBid: number | null;
  buyNowPrice: number | null;
  estimatedValue: number | null;
  damageType: string | null;
  damageDescription?: string;
  primaryDamage?: string;
  secondaryDamage?: string;
  odometer: number | null;
  odometerStatus?: 'actual' | 'not_actual' | 'exempt' | 'unknown';
  titleStatus?: string;
  titleState?: string;
  keys?: 'yes' | 'no' | 'unknown';
  images: string[];
  auctionUrl: string | null;
  confidence: ConfidenceLevel;
  allSources: string[];
}

// ============ LAYER 3: SHIPPING ============
export interface ShippingLayerDto {
  found: boolean;
  reason?: string;
  containerNumber?: string;
  blNumber?: string;
  bookingNumber?: string;
  vessel?: string;
  departurePort?: string;
  arrivalPort?: string;
  departureDate?: Date;
  estimatedArrival?: Date;
  currentLocation?: string;
  status?: 'booked' | 'loaded' | 'in_transit' | 'arrived' | 'cleared';
  confidence: ConfidenceLevel;
}

// ============ HISTORY LAYER (from aggregators) ============
export interface HistoryLayerDto {
  found: boolean;
  titleRecords: number;
  accidents: number;
  owners: number;
  serviceRecords: number;
  salvageRecord: boolean;
  floodDamage: boolean;
  frameDamage: boolean;
  airbagDeployed: boolean;
  odometerRollback: boolean;
  lastOdometer?: number;
  lastOdometerDate?: Date;
  confidence: ConfidenceLevel;
  source?: string;
}

// ============ SCORING ============
export interface ScoringDto {
  dealScore: DealScore;
  marketPrice?: number;
  safeBid?: number;
  maxBid?: number;
  breakEvenBid?: number;
  finalPrice?: number;
  platformMargin?: number;
  profitPotential?: number;
  repairEstimate?: number;
  deliveryEstimate?: number;
  recommendation: string;
}

// ============ SOURCE METADATA ============
export interface SourceMetadataDto {
  name: string;
  type: SourceType;
  tier: SourceTier;
  responseTime: number;
  success: boolean;
  errorReason?: string;
}

// ============ CONFIDENCE SUMMARY ============
export interface ConfidenceSummaryDto {
  overall: number; // 0-1
  vehicleLayer: ConfidenceLevel;
  auctionLayer: ConfidenceLevel;
  historyLayer: ConfidenceLevel;
  shippingLayer: ConfidenceLevel;
}

// ============ SOURCE LAYER TYPE (CORE vs FALLBACK) ============
export type DataSourceType = 'core' | 'fallback';

// ============ MAIN RESPONSE DTO (3-Layer) ============
export interface VinResolveResponseDto {
  success: boolean;
  vin: string;
  status: VehicleStatus;
  
  // 3 Layers
  vehicle: VehicleLayerDto;
  auction: AuctionLayerDto;
  history: HistoryLayerDto;
  shipping: ShippingLayerDto;
  
  // Scoring
  scoring?: ScoringDto;
  
  // Metadata
  confidence: ConfidenceSummaryDto;
  sources: SourceMetadataDto[];
  searchDurationMs: number;
  fromCache: boolean;
  
  // Source layer info
  sourceType: DataSourceType;
  verified: boolean;
  
  // Fallback strategy info
  fallbackStrategy?: {
    mode: FallbackMode;
    delayMs: number;
    triggered: boolean;
  };
  
  // Message
  message: string;
}

// ============ LEGACY COMPATIBILITY ============
// Keep old VehicleDto for backward compatibility
export interface VehicleDto {
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  lotNumber?: string;
  location?: string;
  saleDate?: Date;
  price?: number;
  images: string[];
  damageType?: string;
  mileage?: number;
  confidence: number;
  sources: string[];
}

// ============ CREATE LEAD DTO ============
export interface CreateVinLeadDto {
  vin: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  message?: string;
}

// ============ DISCOVERED SOURCE ============
export interface DiscoveredSource {
  name: string;
  domain: string;
  url: string;
  type: SourceType;
  tier: SourceTier;
  priority: number;
  trustScore: number;
  rateLimit?: {
    requestsPerMinute: number;
    lastRequest?: Date;
  };
}

// ============ EXTRACTED VEHICLE (raw) ============
export interface ExtractedVehicle {
  vin: string;
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyType?: string;
  lotNumber?: string;
  location?: string;
  saleDate?: Date;
  price?: number;
  retailValue?: number;
  images: string[];
  damageType?: string;
  primaryDamage?: string;
  secondaryDamage?: string;
  mileage?: number;
  odometerUnit?: string;
  odometerStatus?: string;
  titleStatus?: string;
  keys?: string;
  // NEW FIELDS for full lot data
  fuel?: string;
  transmission?: string;
  drive?: string;
  bodyStyle?: string;
  seller?: string;
  engine?: string;
  color?: string;
  auctionSource?: string; // Copart, IAAI, etc.
  source: string;
  sourceUrl: string;
  sourceTier: SourceTier;
  confidence: number;
  extractedAt: Date;
  responseTime: number;
}
