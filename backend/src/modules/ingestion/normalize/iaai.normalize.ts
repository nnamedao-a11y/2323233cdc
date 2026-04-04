/**
 * IAAI (Insurance Auto Auctions) Normalizer
 * 
 * Перетворює сирі дані з IAAI у стандартизований Vehicle формат
 */

import { VehicleSource, VehicleStatus } from '../enums/vehicle.enum';
import { NormalizedVehicle } from './copart.normalize';

export interface IAAIRawItem {
  // IAAI specific fields
  stockNumber?: string;
  itemNumber?: string;
  itemId?: string;
  vin?: string;
  vehicleVin?: string;
  make?: string;
  model?: string;
  year?: number | string;
  modelYear?: number | string;
  color?: string;
  exteriorColor?: string;
  odometer?: number | string;
  odometerReading?: number | string;
  odometerBrand?: string;
  title?: string;
  titleType?: string;
  titleState?: string;
  bodyStyle?: string;
  bodyType?: string;
  vehicleType?: string;
  engineSize?: string;
  engineType?: string;
  cylinders?: number | string;
  transmission?: string;
  transmissionType?: string;
  driveLine?: string;
  driveType?: string;
  fuelType?: string;
  primaryDamage?: string;
  secondaryDamage?: string;
  damageDescription?: string;
  lossType?: string;
  acrv?: number; // Actual Cash Retail Value
  estimatedValue?: number;
  currentBid?: number;
  highBid?: number;
  buyItNow?: number;
  startingBid?: number;
  saleDate?: string;
  saleTime?: string;
  saleType?: string;
  branchCode?: string;
  branchName?: string;
  location?: string;
  city?: string;
  state?: string;
  zip?: string;
  runnable?: string | boolean;
  hasKeys?: string | boolean;
  keysAvailable?: boolean;
  airBags?: string;
  images?: string[];
  imageUrls?: string[];
  thumbnailUrl?: string;
  mainImageUrl?: string;
  highlights?: string[];
  notes?: string;
  // Nested structures
  vehicleInfo?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
  };
  [key: string]: any;
}

/**
 * Normalize IAAI raw data to Vehicle format
 */
export function normalizeIAAI(raw: IAAIRawItem): NormalizedVehicle | null {
  const vin = extractVin(raw);
  
  if (!vin || !isValidVin(vin)) {
    return null;
  }

  const externalId = extractExternalId(raw);
  const images = extractImages(raw);

  return {
    vin: vin.toUpperCase(),
    source: VehicleSource.IAAI,
    externalId,
    
    title: extractTitle(raw),
    description: raw.notes || raw.damageDescription,
    
    make: raw.make || raw.vehicleInfo?.make,
    vehicleModel: raw.model || raw.vehicleInfo?.model,
    year: parseYear(raw.year || raw.modelYear || raw.vehicleInfo?.year),
    
    mileage: parseNumber(raw.odometer || raw.odometerReading),
    mileageUnit: raw.odometerBrand?.toLowerCase().includes('km') ? 'km' : 'miles',
    
    color: raw.color || raw.exteriorColor,
    bodyType: raw.bodyStyle || raw.bodyType || raw.vehicleType,
    engineType: raw.engineType || raw.fuelType,
    transmission: raw.transmission || raw.transmissionType,
    drivetrain: raw.driveLine || raw.driveType,
    
    price: extractPrice(raw),
    currency: 'USD',
    estimatedRetailValue: raw.acrv || raw.estimatedValue,
    
    images,
    primaryImage: images[0] || raw.mainImageUrl || raw.thumbnailUrl,
    
    conditionGrade: extractConditionGrade(raw),
    damageType: raw.primaryDamage || raw.lossType,
    damageDescription: [raw.primaryDamage, raw.secondaryDamage].filter(Boolean).join(', '),
    
    hasKeys: parseBoolean(raw.hasKeys || raw.keysAvailable),
    isRunnable: parseBoolean(raw.runnable),
    
    auctionDate: extractAuctionDate(raw),
    auctionLocation: extractLocation(raw),
    lotNumber: raw.stockNumber || raw.itemNumber || externalId,
    saleStatus: raw.saleType || raw.lossType,
    
    sourceUrl: `https://www.iaai.com/VehicleDetail/${externalId}`,
    
    metadata: {
      titleType: raw.titleType,
      titleState: raw.titleState,
      cylinders: raw.cylinders,
      engineSize: raw.engineSize,
      airBags: raw.airBags,
      branchCode: raw.branchCode,
      branchName: raw.branchName,
      highlights: raw.highlights,
      raw: raw,
    },
    
    status: VehicleStatus.ACTIVE,
  };
}

function extractVin(raw: IAAIRawItem): string {
  return raw.vin || raw.vehicleVin || raw.vehicleInfo?.vin || '';
}

function extractExternalId(raw: IAAIRawItem): string {
  return String(raw.stockNumber || raw.itemNumber || raw.itemId || '');
}

function extractTitle(raw: IAAIRawItem): string {
  if (raw.title && !raw.title.toLowerCase().includes('salvage')) {
    return raw.title;
  }
  
  const parts: string[] = [];
  const year = parseYear(raw.year || raw.modelYear || raw.vehicleInfo?.year);
  
  if (year) parts.push(String(year));
  if (raw.make || raw.vehicleInfo?.make) parts.push(raw.make || raw.vehicleInfo?.make || '');
  if (raw.model || raw.vehicleInfo?.model) parts.push(raw.model || raw.vehicleInfo?.model || '');
  
  return parts.join(' ') || `Stock ${extractExternalId(raw)}`;
}

function extractPrice(raw: IAAIRawItem): number {
  return raw.currentBid || raw.highBid || raw.buyItNow || raw.startingBid || 0;
}

function extractImages(raw: IAAIRawItem): string[] {
  const images: string[] = [];
  
  if (raw.images?.length) {
    images.push(...raw.images);
  }
  if (raw.imageUrls?.length) {
    images.push(...raw.imageUrls);
  }
  if (raw.mainImageUrl) {
    images.unshift(raw.mainImageUrl); // Main image first
  }
  
  return [...new Set(images)];
}

function extractConditionGrade(raw: IAAIRawItem): string | undefined {
  const damage = (raw.primaryDamage || raw.lossType || '').toLowerCase();
  
  if (damage.includes('minor') || damage.includes('hail')) return 'A';
  if (damage.includes('front') || damage.includes('rear')) return 'B';
  if (damage.includes('side') || damage.includes('rollover')) return 'C';
  if (damage.includes('total') || damage.includes('burn') || damage.includes('flood')) return 'D';
  
  return undefined;
}

function extractAuctionDate(raw: IAAIRawItem): Date | undefined {
  if (raw.saleDate) {
    const dateStr = raw.saleTime 
      ? `${raw.saleDate} ${raw.saleTime}`
      : raw.saleDate;
    return new Date(dateStr);
  }
  return undefined;
}

function extractLocation(raw: IAAIRawItem): string {
  if (raw.location) return raw.location;
  if (raw.branchName) return raw.branchName;
  
  const parts = [raw.city, raw.state].filter(Boolean);
  return parts.join(', ');
}

function parseYear(value: number | string | undefined): number | undefined {
  if (!value) return undefined;
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  return isNaN(num) ? undefined : num;
}

function parseNumber(value: number | string | undefined): number | undefined {
  if (!value) return undefined;
  const num = typeof value === 'string' ? parseInt(value.replace(/[^0-9]/g, ''), 10) : value;
  return isNaN(num) ? undefined : num;
}

function parseBoolean(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'yes' || lower === 'true' || lower === 'y';
  }
  return false;
}

function isValidVin(vin: string): boolean {
  if (!vin) return false;
  const cleanVin = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
  return cleanVin.length === 17;
}

/**
 * Batch normalize
 */
export function normalizeIAAIBatch(items: IAAIRawItem[]): NormalizedVehicle[] {
  return items
    .map(item => normalizeIAAI(item))
    .filter((item): item is NormalizedVehicle => item !== null);
}
