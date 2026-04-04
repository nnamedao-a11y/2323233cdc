/**
 * Copart Normalizer
 * 
 * Перетворює сирі дані з Copart у стандартизований Vehicle формат
 */

import { VehicleSource, VehicleStatus } from '../enums/vehicle.enum';

export interface CopartRawItem {
  id?: string;
  lotId?: string;
  ln?: string; // lot number
  vin?: string;
  fv?: string; // full VIN
  mkn?: string; // make name
  mdn?: string; // model name
  lcy?: number; // lot year
  orcp?: number; // original retail price
  la?: number; // last auction price
  hb?: number; // high bid
  bnp?: number; // buy now price
  obc?: number; // current bid
  odo?: number; // odometer
  odst?: string; // odometer status
  clr?: string; // color
  dmg?: string; // damage description
  pdd?: string; // primary damage
  sdd?: string; // secondary damage
  ey?: string; // engine type
  tsmn?: string; // transmission
  dtc?: string; // drive train
  keys?: string; // has keys
  starts?: string; // starts/runs
  imgs?: string[]; // images
  tims?: Array<string | { full?: string; img?: string }>; // thumbnail images
  dynamicImages?: { full: string[] };
  imageUrl?: string;
  imageUrls?: string[];
  saleDate?: string;
  lossType?: string;
  vehicleType?: string;
  bodyStyle?: string;
  cylinders?: number;
  fuelType?: string;
  highlights?: string[];
  locationCity?: string;
  locationState?: string;
  locationZip?: string;
  title?: string;
  name?: string;
  // Nested structures
  vehicle?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
  };
  [key: string]: any;
}

export interface NormalizedVehicle {
  vin: string;
  source: VehicleSource;
  externalId: string;
  title: string;
  description?: string;
  make?: string;
  vehicleModel?: string;
  year?: number;
  mileage?: number;
  mileageUnit?: string;
  color?: string;
  bodyType?: string;
  engineType?: string;
  transmission?: string;
  drivetrain?: string;
  price?: number;
  currency?: string;
  estimatedRetailValue?: number;
  images: string[];
  primaryImage?: string;
  conditionGrade?: string;
  damageType?: string;
  damageDescription?: string;
  hasKeys?: boolean;
  isRunnable?: boolean;
  auctionDate?: Date;
  auctionLocation?: string;
  lotNumber?: string;
  saleStatus?: string;
  sourceUrl?: string;
  metadata?: Record<string, any>;
  status: VehicleStatus;
}

/**
 * Normalize Copart raw data to Vehicle format
 */
export function normalizeCopart(raw: CopartRawItem): NormalizedVehicle | null {
  const vin = extractVin(raw);
  
  if (!vin || !isValidVin(vin)) {
    return null;
  }

  const externalId = extractExternalId(raw);
  const images = extractImages(raw);

  return {
    vin: vin.toUpperCase(),
    source: VehicleSource.COPART,
    externalId,
    
    title: extractTitle(raw),
    description: raw.dmg || raw.pdd,
    
    make: raw.mkn || raw.vehicle?.make,
    vehicleModel: raw.mdn || raw.vehicle?.model,
    year: raw.lcy || raw.vehicle?.year,
    
    mileage: raw.odo,
    mileageUnit: raw.odst?.toLowerCase().includes('km') ? 'km' : 'miles',
    
    color: raw.clr,
    bodyType: raw.bodyStyle || raw.vehicleType,
    engineType: raw.ey || raw.fuelType,
    transmission: raw.tsmn,
    drivetrain: raw.dtc,
    
    price: extractPrice(raw),
    currency: 'USD',
    estimatedRetailValue: raw.orcp,
    
    images,
    primaryImage: images[0],
    
    conditionGrade: extractConditionGrade(raw),
    damageType: raw.pdd || raw.dmg,
    damageDescription: [raw.pdd, raw.sdd].filter(Boolean).join(', '),
    
    hasKeys: raw.keys?.toLowerCase() === 'yes',
    isRunnable: raw.starts?.toLowerCase() === 'yes' || raw.starts?.toLowerCase() === 'starts',
    
    auctionDate: raw.saleDate ? new Date(raw.saleDate) : undefined,
    auctionLocation: [raw.locationCity, raw.locationState].filter(Boolean).join(', '),
    lotNumber: raw.ln || raw.lotId || externalId,
    saleStatus: raw.lossType,
    
    sourceUrl: `https://www.copart.com/lot/${externalId}`,
    
    metadata: {
      cylinders: raw.cylinders,
      fuelType: raw.fuelType,
      highlights: raw.highlights,
      locationZip: raw.locationZip,
      raw: raw,
    },
    
    status: VehicleStatus.ACTIVE,
  };
}

function extractVin(raw: CopartRawItem): string {
  return raw.fv || raw.vin || raw.vehicle?.vin || '';
}

function extractExternalId(raw: CopartRawItem): string {
  return String(raw.ln || raw.id || raw.lotId || '');
}

function extractTitle(raw: CopartRawItem): string {
  if (raw.title) return raw.title;
  if (raw.name) return raw.name;
  
  const parts: string[] = [];
  if (raw.lcy || raw.vehicle?.year) parts.push(String(raw.lcy || raw.vehicle?.year));
  if (raw.mkn || raw.vehicle?.make) parts.push(raw.mkn || raw.vehicle?.make || '');
  if (raw.mdn || raw.vehicle?.model) parts.push(raw.mdn || raw.vehicle?.model || '');
  
  return parts.join(' ') || `Lot ${extractExternalId(raw)}`;
}

function extractPrice(raw: CopartRawItem): number {
  return raw.obc || raw.hb || raw.bnp || raw.la || 0;
}

function extractImages(raw: CopartRawItem): string[] {
  const images: string[] = [];
  
  // Copart tims array can contain objects with 'full' key or strings
  if (raw.tims?.length) {
    for (const t of raw.tims) {
      if (typeof t === 'string') {
        images.push(t);
      } else if (t?.full) {
        images.push(t.full);
      } else if (t?.img) {
        images.push(t.img);
      }
    }
  }
  if (raw.imgs?.length) {
    images.push(...raw.imgs);
  }
  if (raw.dynamicImages?.full?.length) {
    images.push(...raw.dynamicImages.full);
  }
  if (raw.imageUrls?.length) {
    images.push(...raw.imageUrls);
  }
  if (raw.imageUrl) {
    images.push(raw.imageUrl);
  }
  
  return [...new Set(images)]; // Dedupe
}

function extractConditionGrade(raw: CopartRawItem): string | undefined {
  // Map damage type to grade
  const damage = (raw.pdd || raw.dmg || '').toLowerCase();
  
  if (damage.includes('minor') || damage.includes('normal')) return 'A';
  if (damage.includes('front') || damage.includes('rear')) return 'B';
  if (damage.includes('side') || damage.includes('rollover')) return 'C';
  if (damage.includes('total') || damage.includes('burn')) return 'D';
  
  return undefined;
}

function isValidVin(vin: string): boolean {
  if (!vin) return false;
  const cleanVin = vin.replace(/[^A-HJ-NPR-Z0-9*]/gi, '').toUpperCase();
  // Accept VINs with masked characters (***) or full 17 chars
  // Copart masks last 6 characters for public API
  return cleanVin.length >= 11 && cleanVin.length <= 17;
}

/**
 * Batch normalize
 */
export function normalizeCopartBatch(items: CopartRawItem[]): NormalizedVehicle[] {
  return items
    .map(item => normalizeCopart(item))
    .filter((item): item is NormalizedVehicle => item !== null);
}
