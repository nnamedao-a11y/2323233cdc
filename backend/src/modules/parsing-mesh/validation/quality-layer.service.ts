/**
 * Quality Layer Service
 * 
 * Validation, Scoring, Garbage Detection, Source Penalty
 * 
 * Відповідає за:
 * - Field validation (VIN, price, date ranges)
 * - Confidence calculation per field
 * - Garbage/spam detection
 * - Source trust penalty system
 */

import { Injectable, Logger } from '@nestjs/common';
import { NormalizedVehicle } from '../adapters/interfaces/vin-source-adapter.interface';
import { isValidVin, cleanVin } from '../utils/vin.utils';
import { SourceService } from '../sources/source.service';

export interface QualityReport {
  isValid: boolean;
  confidence: number;
  fieldConfidence: Record<string, number>;
  issues: string[];
  validatedVehicle: NormalizedVehicle | null;
}

export interface FieldValidationResult {
  valid: boolean;
  confidence: number;
  issue?: string;
}

@Injectable()
export class QualityLayerService {
  private readonly logger = new Logger(QualityLayerService.name);

  constructor(private readonly sourceService: SourceService) {}

  /**
   * Full quality check on a vehicle
   */
  async validateVehicle(
    vehicle: NormalizedVehicle,
    targetVin: string,
  ): Promise<QualityReport> {
    const issues: string[] = [];
    const fieldConfidence: Record<string, number> = {};

    // 1. VIN Validation
    const vinResult = this.validateVin(vehicle.vin, targetVin);
    fieldConfidence.vin = vinResult.confidence;
    if (!vinResult.valid) {
      issues.push(vinResult.issue || 'Invalid VIN');
      return {
        isValid: false,
        confidence: 0,
        fieldConfidence,
        issues,
        validatedVehicle: null,
      };
    }

    // 2. Price Validation
    const priceResult = this.validatePrice(vehicle.price);
    fieldConfidence.price = priceResult.confidence;
    if (priceResult.issue) issues.push(priceResult.issue);

    // 3. Date Validation
    const dateResult = this.validateSaleDate(vehicle.saleDate);
    fieldConfidence.saleDate = dateResult.confidence;
    if (dateResult.issue) issues.push(dateResult.issue);

    // 4. Lot Number Validation
    const lotResult = this.validateLotNumber(vehicle.lotNumber);
    fieldConfidence.lotNumber = lotResult.confidence;
    if (lotResult.issue) issues.push(lotResult.issue);

    // 5. Mileage Validation
    const mileageResult = this.validateMileage(vehicle.mileage);
    fieldConfidence.mileage = mileageResult.confidence;
    if (mileageResult.issue) issues.push(mileageResult.issue);

    // 6. Title/Make/Model Validation
    const titleResult = this.validateTitle(vehicle.title, vehicle.make, vehicle.model);
    fieldConfidence.title = titleResult.confidence;
    if (titleResult.issue) issues.push(titleResult.issue);

    // 7. Images Validation
    const imagesResult = this.validateImages(vehicle.images);
    fieldConfidence.images = imagesResult.confidence;
    if (imagesResult.issue) issues.push(imagesResult.issue);

    // 8. Garbage Detection
    const isGarbage = this.detectGarbage(vehicle);
    if (isGarbage) {
      issues.push('Detected as garbage/spam page');
      return {
        isValid: false,
        confidence: 0,
        fieldConfidence,
        issues,
        validatedVehicle: null,
      };
    }

    // 9. Calculate overall confidence
    const sourceTrust = await this.getSourceTrust(vehicle.source);
    const overallConfidence = this.calculateOverallConfidence(
      fieldConfidence,
      sourceTrust,
    );

    // 10. Update validated vehicle with adjusted confidence
    const validatedVehicle: NormalizedVehicle = {
      ...vehicle,
      confidence: overallConfidence,
    };

    return {
      isValid: true,
      confidence: overallConfidence,
      fieldConfidence,
      issues,
      validatedVehicle,
    };
  }

  /**
   * Batch validate multiple vehicles
   */
  async validateBatch(
    vehicles: NormalizedVehicle[],
    targetVin: string,
  ): Promise<NormalizedVehicle[]> {
    const validated: NormalizedVehicle[] = [];

    for (const vehicle of vehicles) {
      const report = await this.validateVehicle(vehicle, targetVin);
      if (report.isValid && report.validatedVehicle) {
        validated.push(report.validatedVehicle);
      } else {
        this.logger.debug(
          `[QualityLayer] Rejected ${vehicle.source}: ${report.issues.join(', ')}`
        );
        // Apply source penalty for invalid data
        if (report.issues.some(i => i.includes('VIN mismatch'))) {
          await this.applySourcePenalty(vehicle.source, 'wrong_vin');
        }
      }
    }

    return validated;
  }

  // ========== FIELD VALIDATORS ==========

  private validateVin(vin: string | null | undefined, targetVin: string): FieldValidationResult {
    if (!vin) {
      return { valid: false, confidence: 0, issue: 'Missing VIN' };
    }

    const cleaned = cleanVin(vin);
    const cleanedTarget = cleanVin(targetVin);

    if (!isValidVin(cleaned)) {
      return { valid: false, confidence: 0, issue: 'Invalid VIN format' };
    }

    if (cleaned !== cleanedTarget) {
      return { valid: false, confidence: 0, issue: `VIN mismatch: expected ${cleanedTarget}, got ${cleaned}` };
    }

    return { valid: true, confidence: 1.0 };
  }

  private validatePrice(price: number | null | undefined): FieldValidationResult {
    if (price === null || price === undefined) {
      return { valid: true, confidence: 0 }; // Missing is OK, just no confidence
    }

    if (price < 0) {
      return { valid: false, confidence: 0, issue: 'Negative price' };
    }

    if (price < 100) {
      return { valid: true, confidence: 0.3, issue: 'Suspiciously low price' };
    }

    if (price > 500000) {
      return { valid: true, confidence: 0.5, issue: 'Unusually high price' };
    }

    // Normal range
    return { valid: true, confidence: 0.9 };
  }

  private validateSaleDate(date: Date | null | undefined): FieldValidationResult {
    if (!date) {
      return { valid: true, confidence: 0 };
    }

    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oldestAllowed = new Date('2005-01-01');

    if (date > oneWeekFromNow) {
      return { valid: false, confidence: 0, issue: 'Sale date too far in future' };
    }

    if (date < oldestAllowed) {
      return { valid: true, confidence: 0.3, issue: 'Very old sale date' };
    }

    // Recent dates have higher confidence
    const daysSinceNow = (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceNow < 30) {
      return { valid: true, confidence: 1.0 }; // Recent
    } else if (daysSinceNow < 365) {
      return { valid: true, confidence: 0.8 }; // Within a year
    } else {
      return { valid: true, confidence: 0.5 }; // Old
    }
  }

  private validateLotNumber(lot: string | null | undefined): FieldValidationResult {
    if (!lot) {
      return { valid: true, confidence: 0 };
    }

    // Lot numbers are typically numeric or alphanumeric
    if (!/^[A-Za-z0-9\-]+$/.test(lot)) {
      return { valid: false, confidence: 0, issue: 'Invalid lot number format' };
    }

    if (lot.length < 4 || lot.length > 20) {
      return { valid: true, confidence: 0.5, issue: 'Unusual lot number length' };
    }

    return { valid: true, confidence: 0.9 };
  }

  private validateMileage(mileage: number | null | undefined): FieldValidationResult {
    if (mileage === null || mileage === undefined) {
      return { valid: true, confidence: 0 };
    }

    if (mileage < 0) {
      return { valid: false, confidence: 0, issue: 'Negative mileage' };
    }

    if (mileage > 500000) {
      return { valid: true, confidence: 0.5, issue: 'Very high mileage' };
    }

    return { valid: true, confidence: 0.9 };
  }

  private validateTitle(
    title: string | null | undefined,
    make: string | null | undefined,
    model: string | null | undefined,
  ): FieldValidationResult {
    const hasTitle = title && title.length > 5;
    const hasMake = make && make.length > 1;
    const hasModel = model && model.length > 1;

    if (!hasTitle && !hasMake && !hasModel) {
      return { valid: true, confidence: 0, issue: 'No title/make/model info' };
    }

    let confidence = 0;
    if (hasTitle) confidence += 0.3;
    if (hasMake) confidence += 0.35;
    if (hasModel) confidence += 0.35;

    return { valid: true, confidence };
  }

  private validateImages(images: string[] | null | undefined): FieldValidationResult {
    if (!images || images.length === 0) {
      return { valid: true, confidence: 0 };
    }

    // Filter valid images
    const validImages = images.filter(img => {
      if (!img) return false;
      if (img.includes('placeholder')) return false;
      if (img.includes('loading')) return false;
      if (img.includes('default')) return false;
      if (img.length < 10) return false;
      return true;
    });

    if (validImages.length === 0) {
      return { valid: true, confidence: 0, issue: 'Only placeholder images' };
    }

    // More images = higher confidence (up to 10)
    const confidence = Math.min(1.0, validImages.length * 0.1);
    return { valid: true, confidence };
  }

  // ========== GARBAGE DETECTION ==========

  private detectGarbage(vehicle: NormalizedVehicle): boolean {
    // Rule 1: No meaningful data at all
    const hasTitle = vehicle.title && vehicle.title.length > 5;
    const hasPrice = vehicle.price && vehicle.price > 0;
    const hasImages = vehicle.images && vehicle.images.length > 0;
    const hasMake = vehicle.make && vehicle.make.length > 1;

    if (!hasTitle && !hasPrice && !hasImages && !hasMake) {
      return true;
    }

    // Rule 2: SEO spam / Landing page detection
    const spamPatterns = [
      'buy now', 'click here', 'free vin', 'check vin',
      'order report', 'get history', 'vehicle report',
      'auto auctions', '100% online', 'million used',
      'repairable cars', 'wholesale', 'per year',
      'sign up', 'register', 'login', 'create account',
      'salvage title', 'clean title for sale',
    ];
    
    if (vehicle.title) {
      const lowerTitle = vehicle.title.toLowerCase();
      for (const pattern of spamPatterns) {
        if (lowerTitle.includes(pattern)) {
          return true;
        }
      }
      
      // Title too long = probably landing page text
      if (vehicle.title.length > 150) {
        return true;
      }
      
      // Title has newlines = scraped block of text
      if (vehicle.title.includes('\n')) {
        return true;
      }
    }

    // Rule 3: Duplicate/template page (generic title without VIN specifics)
    if (vehicle.title && vehicle.title.includes('VIN Decoder') && !vehicle.make) {
      return true;
    }

    // Rule 4: Images are landing page images
    if (vehicle.images && vehicle.images.length > 0) {
      const landingImagePatterns = ['landing-page', 'hero', 'banner', 'logo', 'icon', 'avatar'];
      const validImages = vehicle.images.filter(img => 
        !landingImagePatterns.some(pattern => img.toLowerCase().includes(pattern))
      );
      if (validImages.length === 0 && vehicle.images.length > 0) {
        return true;
      }
    }

    return false;
  }

  // ========== CONFIDENCE CALCULATION ==========

  private calculateOverallConfidence(
    fieldConfidence: Record<string, number>,
    sourceTrust: number,
  ): number {
    // Weights for each field
    const weights: Record<string, number> = {
      vin: 0.20,
      price: 0.15,
      saleDate: 0.10,
      lotNumber: 0.10,
      mileage: 0.05,
      title: 0.15,
      images: 0.15,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [field, confidence] of Object.entries(fieldConfidence)) {
      const weight = weights[field] || 0.05;
      weightedSum += confidence * weight;
      totalWeight += weight;
    }

    const fieldScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Combine with source trust
    const finalScore = fieldScore * 0.7 + sourceTrust * 0.3;

    return Number(Math.min(1, finalScore).toFixed(3));
  }

  // ========== SOURCE TRUST ==========

  private async getSourceTrust(sourceName: string): Promise<number> {
    const source = await this.sourceService.getByName(sourceName);
    return source?.trustScore || 0.5;
  }

  async applySourcePenalty(
    sourceName: string,
    reason: 'wrong_vin' | 'empty_data' | 'garbage' | 'error',
  ): Promise<void> {
    const penalties: Record<string, number> = {
      wrong_vin: 0.15,
      empty_data: 0.05,
      garbage: 0.10,
      error: 0.05,
    };

    const penalty = penalties[reason] || 0.05;
    const source = await this.sourceService.getByName(sourceName);
    
    if (source) {
      const newTrust = Math.max(0.1, (source.trustScore || 0.5) - penalty);
      await this.sourceService.update(sourceName, { trustScore: newTrust });
      this.logger.warn(`[QualityLayer] Applied penalty to ${sourceName}: -${penalty} (${reason})`);
    }
  }

  async rewardSource(sourceName: string, amount: number = 0.02): Promise<void> {
    const source = await this.sourceService.getByName(sourceName);
    
    if (source) {
      const newTrust = Math.min(0.99, (source.trustScore || 0.5) + amount);
      await this.sourceService.update(sourceName, { trustScore: newTrust });
    }
  }
}
