/**
 * VIN Validation Service
 * 
 * Викидає мусор, перевіряє VIN відповідність, фільтрує spam
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedVehicle } from '../interfaces/extracted-vehicle.interface';

@Injectable()
export class VinValidationService {
  private readonly logger = new Logger(VinValidationService.name);

  validate(vin: string, items: ExtractedVehicle[]): ExtractedVehicle[] {
    const normalizedVin = vin.trim().toUpperCase();
    const validated: ExtractedVehicle[] = [];
    let rejected = 0;

    for (const item of items) {
      const result = this.validateSingle(normalizedVin, item);
      if (result.valid) {
        validated.push(item);
      } else {
        rejected++;
        this.logger.debug(`[Validation] Rejected ${item.source}: ${result.reason}`);
      }
    }

    this.logger.log(`[Validation] Passed: ${validated.length}, Rejected: ${rejected}`);
    return validated;
  }

  private validateSingle(targetVin: string, item: ExtractedVehicle): { valid: boolean; reason?: string } {
    // Rule 1: Must have VIN
    if (!item.vin) {
      return { valid: false, reason: 'Missing VIN' };
    }

    // Rule 2: VIN must match
    const itemVin = item.vin.trim().toUpperCase();
    if (itemVin !== targetVin) {
      return { valid: false, reason: `VIN mismatch: ${itemVin}` };
    }

    // Rule 3: Price sanity check
    if (item.price !== undefined) {
      if (item.price < 50 || item.price > 500000) {
        return { valid: false, reason: `Suspicious price: ${item.price}` };
      }
    }

    // Rule 4: Year sanity check
    if (item.year !== undefined) {
      if (item.year < 1980 || item.year > new Date().getFullYear() + 2) {
        return { valid: false, reason: `Invalid year: ${item.year}` };
      }
    }

    // Rule 5: Date sanity check
    if (item.saleDate) {
      const date = new Date(item.saleDate);
      if (isNaN(date.getTime())) {
        item.saleDate = undefined; // Clear invalid date
      } else {
        const now = new Date();
        const maxFuture = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
        const minPast = new Date('2010-01-01');
        
        if (date > maxFuture || date < minPast) {
          item.saleDate = undefined; // Clear out-of-range date
        }
      }
    }

    // Rule 6: Title spam detection
    if (item.title) {
      const spamPatterns = [
        'buy now', 'click here', 'free vin', 'check vin',
        'order report', 'vehicle report', '100% online',
        'auto auctions', 'million used', 'sign up',
        'register', 'login', 'create account',
      ];
      
      const lowerTitle = item.title.toLowerCase();
      for (const pattern of spamPatterns) {
        if (lowerTitle.includes(pattern)) {
          item.title = undefined; // Clear spam title
          break;
        }
      }

      // Title too long = garbage
      if (item.title && item.title.length > 100) {
        item.title = undefined;
      }

      // Title has newlines = scraped text block
      if (item.title && item.title.includes('\n')) {
        item.title = undefined;
      }
    }

    // Rule 7: Must have SOME useful data
    const hasUsefulData =
      Boolean(item.title) ||
      Boolean(item.price) ||
      Boolean(item.year) ||
      Boolean(item.make) ||
      Boolean(item.saleDate) ||
      Boolean(item.lotNumber) ||
      Boolean(item.images?.length);

    if (!hasUsefulData) {
      return { valid: false, reason: 'No useful data' };
    }

    // Rule 8: Image validation
    if (item.images && item.images.length > 0) {
      const spamImagePatterns = ['landing', 'hero', 'banner', 'logo', 'icon', 'placeholder'];
      item.images = item.images.filter(img => {
        const lowerImg = img.toLowerCase();
        return !spamImagePatterns.some(p => lowerImg.includes(p));
      });
    }

    return { valid: true };
  }

  /**
   * Check VIN format validity
   */
  isValidVinFormat(vin: string): boolean {
    if (!vin) return false;
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    return cleaned.length === 17;
  }
}
