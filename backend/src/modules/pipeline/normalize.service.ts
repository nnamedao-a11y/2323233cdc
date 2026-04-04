/**
 * Normalize Service
 * 
 * Нормалізація сирих даних з різних джерел в єдиний формат
 */

import { Injectable, Logger } from '@nestjs/common';

export interface NormalizedVehicle {
  vin: string | null;
  title: string;
  price: number | null;
  images: string[];
  saleDate: Date | null;
  source: string;
  externalId?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  damageType?: string;
  location?: string;
  lotNumber?: string;
}

@Injectable()
export class NormalizeService {
  private readonly logger = new Logger(NormalizeService.name);

  normalize(raw: any, source: string = 'unknown'): NormalizedVehicle {
    return {
      vin: this.normalizeVin(raw.vin || raw.VIN || raw.fv),
      title: this.normalizeTitle(raw),
      price: this.parsePrice(raw.price || raw.currentBid || raw.obc),
      images: this.normalizeImages(raw.images || raw.tims),
      saleDate: this.parseDate(raw.saleDate || raw.auctionDate || raw.ad),
      source: source,
      externalId: String(raw.externalId || raw.lotId || raw.ln || raw.stockNo || ''),
      make: raw.make || raw.mkn,
      model: raw.model || raw.vehicleModel || raw.lm || raw.mdn,
      year: this.parseYear(raw.year || raw.lcy),
      mileage: this.parseMileage(raw.mileage || raw.odometer || raw.orr),
      damageType: raw.damageType || raw.dd || raw.primaryDamage,
      location: raw.location || raw.auctionLocation || raw.yn || raw.branch,
      lotNumber: raw.lotNumber || raw.ln || raw.stockNo,
    };
  }

  private normalizeVin(vin: any): string | null {
    if (!vin) return null;
    const cleaned = String(vin).trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    // VIN must be 17 characters
    if (cleaned.length !== 17) {
      this.logger.warn(`Invalid VIN length: ${cleaned} (${cleaned.length})`);
      return cleaned.length >= 11 ? cleaned : null; // Allow partial VIN for some sources
    }
    return cleaned;
  }

  private normalizeTitle(raw: any): string {
    if (raw.title) return String(raw.title).trim();
    
    // Build title from parts
    const parts = [
      raw.year || raw.lcy,
      raw.make || raw.mkn,
      raw.model || raw.vehicleModel || raw.lm,
    ].filter(Boolean);
    
    return parts.join(' ').trim() || 'Unknown Vehicle';
  }

  private parsePrice(price: any): number | null {
    if (!price) return null;
    if (typeof price === 'number') return price;
    
    const num = String(price).replace(/[^\d.]/g, '');
    const parsed = parseFloat(num);
    return isNaN(parsed) ? null : Math.round(parsed);
  }

  private normalizeImages(images: any): string[] {
    if (!images) return [];
    
    if (Array.isArray(images)) {
      return images
        .map(img => {
          if (typeof img === 'string') return img;
          if (img?.full) return img.full;
          if (img?.url) return img.url;
          return null;
        })
        .filter(Boolean) as string[];
    }
    
    if (typeof images === 'string') return [images];
    if (typeof images === 'object') {
      return Object.values(images)
        .map((v: any) => {
          if (typeof v === 'string') return v;
          if (v?.full) return v.full;
          return null;
        })
        .filter(Boolean) as string[];
    }
    
    return [];
  }

  private parseDate(date: any): Date | null {
    if (!date) return null;
    
    try {
      const parsed = new Date(date);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  private parseYear(year: any): number | undefined {
    if (!year) return undefined;
    const parsed = parseInt(String(year), 10);
    return (parsed >= 1900 && parsed <= 2030) ? parsed : undefined;
  }

  private parseMileage(mileage: any): number | undefined {
    if (!mileage) return undefined;
    const parsed = parseInt(String(mileage).replace(/[^\d]/g, ''), 10);
    return isNaN(parsed) ? undefined : parsed;
  }
}
