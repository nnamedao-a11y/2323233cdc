/**
 * VIN Validation Service v2
 * 
 * CRITICAL P0: Strict VIN validation to prevent wrong vehicle data
 * 
 * Rules:
 * 1. VIN must match EXACTLY (no partial, no fuzzy)
 * 2. If VIN doesn't match → REJECT (not merge, not fallback)
 * 3. Data completeness check
 * 4. Source confidence threshold
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedVehicle } from '../dto/vin.dto';

@Injectable()
export class VinValidationService {
  private readonly logger = new Logger(VinValidationService.name);

  /**
   * Validate extracted vehicles with STRICT VIN matching
   * 
   * P0 Rule: If VIN doesn't match → DISCARD completely
   */
  validate(targetVin: string, vehicles: ExtractedVehicle[]): ExtractedVehicle[] {
    const normalizedTarget = this.normalizeVin(targetVin);
    
    if (!this.isValidVinFormat(normalizedTarget)) {
      this.logger.warn(`[Validation] Invalid target VIN format: ${targetVin}`);
      return [];
    }

    const validated: ExtractedVehicle[] = [];
    let rejectedVinMismatch = 0;
    let rejectedNoData = 0;
    let rejectedLowConfidence = 0;

    for (const vehicle of vehicles) {
      // RULE 1 (P0 CRITICAL): VIN must match EXACTLY
      const extractedVin = this.normalizeVin(vehicle.vin || '');
      
      if (!this.vinsEqual(normalizedTarget, extractedVin)) {
        this.logger.warn(
          `[Validation] P0 REJECT: VIN mismatch from ${vehicle.source}. ` +
          `Expected: ${normalizedTarget}, Got: ${extractedVin || 'NONE'}`
        );
        rejectedVinMismatch++;
        continue; // HARD REJECT - no fallback, no merge
      }

      // RULE 2: Must have useful data
      const dataScore = this.calculateDataScore(vehicle);
      if (dataScore < 0.1) {
        this.logger.debug(`[Validation] No useful data from ${vehicle.source} (score: ${dataScore})`);
        rejectedNoData++;
        continue;
      }

      // RULE 3: Confidence threshold (lower for LocalDecoder)
      const minConfidence = vehicle.source === 'LocalDecoder' ? 0.2 : 0.3;
      if ((vehicle.confidence || 0) < minConfidence) {
        this.logger.debug(
          `[Validation] Low confidence (${vehicle.confidence}) from ${vehicle.source}`
        );
        rejectedLowConfidence++;
        continue;
      }

      // Clean and add
      const cleaned = this.cleanVehicle(vehicle, normalizedTarget);
      validated.push(cleaned);
    }

    this.logger.log(
      `[Validation] Results: ${validated.length} passed, ` +
      `${rejectedVinMismatch} VIN mismatch (P0), ` +
      `${rejectedNoData} no data, ` +
      `${rejectedLowConfidence} low confidence`
    );

    return validated;
  }

  /**
   * Validate VIN format (17 chars, valid chars, no I/O/Q)
   */
  isValidVinFormat(vin: string): boolean {
    const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
    return VIN_REGEX.test(vin);
  }

  /**
   * Normalize VIN for comparison
   */
  private normalizeVin(vin: string): string {
    return (vin || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, '');
  }

  /**
   * Compare two VINs - EXACT match only (P0)
   */
  private vinsEqual(target: string, extracted: string): boolean {
    if (!target || !extracted) return false;
    if (target.length !== 17 || extracted.length !== 17) return false;
    return target === extracted;
  }

  /**
   * Calculate data completeness score
   */
  private calculateDataScore(vehicle: ExtractedVehicle): number {
    let score = 0;

    // Basic vehicle info
    if (vehicle.year) score += 0.15;
    if (vehicle.make) score += 0.15;
    if (vehicle.model) score += 0.15;
    if (vehicle.title && vehicle.title.length > 5) score += 0.1;

    // Auction data (more valuable)
    if (vehicle.lotNumber) score += 0.15;
    if (vehicle.price && vehicle.price > 0) score += 0.1;
    if (vehicle.mileage && vehicle.mileage > 0) score += 0.05;
    if (vehicle.images && vehicle.images.length > 0) score += 0.1;
    if (vehicle.damageType || vehicle.primaryDamage) score += 0.05;

    return Math.min(score, 1);
  }

  /**
   * Clean vehicle data
   */
  private cleanVehicle(vehicle: ExtractedVehicle, validatedVin: string): ExtractedVehicle {
    return {
      ...vehicle,
      vin: validatedVin, // Use validated VIN
      title: this.cleanTitle(vehicle.title),
      images: this.cleanImages(vehicle.images),
      price: this.cleanPrice(vehicle.price),
      mileage: this.cleanMileage(vehicle.mileage),
      year: this.cleanYear(vehicle.year),
    };
  }

  private cleanTitle(title?: string): string | undefined {
    if (!title) return undefined;
    
    // Remove spam patterns
    const spam = [
      'auto auctions', 'buy car', 'sell car', 'welcome', 'homepage',
      'search results', 'login', 'sign up', 'register', 'cookie',
      'privacy policy', 'terms of service'
    ];
    const lower = title.toLowerCase();
    
    for (const s of spam) {
      if (lower.includes(s)) return undefined;
    }

    // Clean up whitespace
    return title.replace(/\s+/g, ' ').trim();
  }

  private cleanImages(images?: string[]): string[] {
    if (!images) return [];
    
    return images.filter(img => {
      if (!img) return false;
      
      const lower = img.toLowerCase();
      
      // Skip UI elements
      if (lower.includes('placeholder')) return false;
      if (lower.includes('icon')) return false;
      if (lower.includes('logo')) return false;
      if (lower.includes('loading')) return false;
      if (lower.includes('sprite')) return false;
      if (lower.includes('arrow')) return false;
      if (lower.includes('button')) return false;
      
      // Must be valid URL
      try {
        const url = new URL(img);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    });
  }

  private cleanPrice(price?: number): number | undefined {
    if (!price || price <= 0) return undefined;
    if (price < 50) return undefined; // Too low
    if (price > 10000000) return undefined; // Too high
    return Math.round(price);
  }

  private cleanMileage(mileage?: number): number | undefined {
    if (!mileage || mileage <= 0) return undefined;
    if (mileage > 1000000) return undefined;
    return Math.round(mileage);
  }

  private cleanYear(year?: number): number | undefined {
    if (!year) return undefined;
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear + 2) return undefined;
    return year;
  }
}
