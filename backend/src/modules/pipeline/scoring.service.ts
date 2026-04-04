/**
 * Scoring Service
 * 
 * Оцінка якості даних про автомобіль
 * 
 * Score = 
 *   hasVIN * 0.4 +
 *   hasSaleDate * 0.3 +
 *   hasImages * 0.2 +
 *   hasPrice * 0.1 +
 *   sourceTrust bonus
 */

import { Injectable, Logger } from '@nestjs/common';

// Source trust scores (0-1)
const SOURCE_TRUST: Record<string, number> = {
  'copart': 0.95,
  'iaai': 0.95,
  'manheim': 0.90,
  'adesa': 0.90,
  'autobidmaster': 0.85,
  'salvagebid': 0.80,
  'bidfax': 0.75,
  'poctra': 0.70,
  'vin_search': 0.60,
  'google': 0.50,
  'unknown': 0.30,
};

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  /**
   * Calculate data quality score (0-1)
   */
  score(vehicle: any): number {
    let score = 0;
    const weights = {
      vin: 0.25,
      saleDate: 0.20,
      images: 0.15,
      price: 0.10,
      title: 0.10,
      damage: 0.05,
      mileage: 0.05,
      location: 0.05,
      sourceTrust: 0.05,
    };

    // VIN - most important
    if (vehicle.vin && vehicle.vin.length === 17) {
      score += weights.vin;
    } else if (vehicle.vin && vehicle.vin.length >= 11) {
      score += weights.vin * 0.5;
    }

    // Sale date
    if (vehicle.saleDate || vehicle.auctionDate) {
      const date = new Date(vehicle.saleDate || vehicle.auctionDate);
      if (!isNaN(date.getTime())) {
        score += weights.saleDate;
        // Bonus for future date
        if (date > new Date()) {
          score += 0.05;
        }
      }
    }

    // Images
    const images = vehicle.images || [];
    if (images.length > 0) {
      score += weights.images * Math.min(1, images.length / 5);
    }

    // Price
    if (vehicle.price && vehicle.price > 0) {
      score += weights.price;
    }

    // Title
    if (vehicle.title && vehicle.title !== 'Unknown Vehicle' && vehicle.title.length > 10) {
      score += weights.title;
    }

    // Damage info
    if (vehicle.damageType || vehicle.damageDescription) {
      score += weights.damage;
    }

    // Mileage
    if (vehicle.mileage && vehicle.mileage > 0) {
      score += weights.mileage;
    }

    // Location
    if (vehicle.location || vehicle.auctionLocation) {
      score += weights.location;
    }

    // Source trust
    const sources = vehicle.sources || [vehicle.source];
    const maxTrust = Math.max(
      ...sources.map((s: string) => SOURCE_TRUST[s?.toLowerCase()] || SOURCE_TRUST.unknown)
    );
    score += weights.sourceTrust * maxTrust;

    return Math.min(1, Math.round(score * 100) / 100);
  }

  /**
   * Get confidence level label
   */
  getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Get source trust score
   */
  getSourceTrust(source: string): number {
    return SOURCE_TRUST[source?.toLowerCase()] || SOURCE_TRUST.unknown;
  }
}
