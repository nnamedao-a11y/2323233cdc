/**
 * Merge Service
 * 
 * Об'єднання даних з різних джерел в одну сутність
 * Вибирає найкращі значення з existing та incoming
 */

import { Injectable, Logger } from '@nestjs/common';
import { NormalizedVehicle } from './normalize.service';

export interface MergedVehicle extends Partial<NormalizedVehicle> {
  sources: string[];
  mergeCount: number;
  lastMergedAt: Date;
}

@Injectable()
export class MergeService {
  private readonly logger = new Logger(MergeService.name);

  merge(existing: any, incoming: NormalizedVehicle): MergedVehicle {
    const existingSources = existing.sources || [existing.source];
    const incomingSources = incoming.source ? [incoming.source] : [];
    
    return {
      vin: existing.vin || incoming.vin,
      title: this.pickBetterString(existing.title, incoming.title),
      price: this.pickBetterPrice(existing.price, incoming.price),
      images: this.mergeImages(existing.images, incoming.images),
      saleDate: this.pickBetterDate(existing.saleDate, incoming.saleDate),
      source: incoming.source || existing.source,
      externalId: existing.externalId || incoming.externalId,
      make: existing.make || incoming.make,
      model: existing.vehicleModel || existing.model || incoming.model,
      year: existing.year || incoming.year,
      mileage: this.pickBetterNumber(existing.mileage, incoming.mileage),
      damageType: existing.damageType || incoming.damageType,
      location: existing.location || existing.auctionLocation || incoming.location,
      lotNumber: existing.lotNumber || incoming.lotNumber,
      sources: this.mergeSources(existingSources, incomingSources),
      mergeCount: (existing.mergeCount || 1) + 1,
      lastMergedAt: new Date(),
    };
  }

  private pickBetterString(a: string | undefined, b: string | undefined): string {
    if (!a || a === 'Unknown Vehicle') return b || '';
    if (!b || b === 'Unknown Vehicle') return a;
    // Prefer longer, more descriptive title
    return a.length >= b.length ? a : b;
  }

  private pickBetterPrice(a: number | null | undefined, b: number | null | undefined): number | null {
    // Prefer non-null, non-zero price
    if (a && a > 0) return a;
    if (b && b > 0) return b;
    return a || b || null;
  }

  private pickBetterNumber(a: number | undefined, b: number | undefined): number | undefined {
    if (a && a > 0) return a;
    if (b && b > 0) return b;
    return a || b;
  }

  private pickBetterDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
    // Prefer future dates for auctions
    const now = new Date();
    
    if (a && b) {
      const aTime = new Date(a).getTime();
      const bTime = new Date(b).getTime();
      
      // If both are in future, pick closer one
      if (aTime > now.getTime() && bTime > now.getTime()) {
        return aTime < bTime ? a : b;
      }
      // Prefer future date
      if (aTime > now.getTime()) return a;
      if (bTime > now.getTime()) return b;
      
      // Both in past, pick more recent
      return aTime > bTime ? a : b;
    }
    
    return a || b || null;
  }

  private mergeImages(a: string[] | undefined, b: string[] | undefined): string[] {
    const set = new Set<string>();
    
    (a || []).forEach(img => {
      if (img && typeof img === 'string') set.add(img);
    });
    
    (b || []).forEach(img => {
      if (img && typeof img === 'string') set.add(img);
    });
    
    return Array.from(set);
  }

  private mergeSources(a: string[], b: string[]): string[] {
    const set = new Set<string>();
    
    a.forEach(s => s && set.add(s));
    b.forEach(s => s && set.add(s));
    
    return Array.from(set);
  }
}
