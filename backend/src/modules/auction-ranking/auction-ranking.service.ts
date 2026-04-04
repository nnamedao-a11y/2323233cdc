/**
 * Auction Ranking Service
 * 
 * Обчислює ranking score для кожного аукціону
 * 
 * Formula:
 * rankingScore = 
 *   auctionConfidence * 0.25 +
 *   timerUrgency * 0.25 +
 *   dataCompleteness * 0.2 +
 *   sourceQuality * 0.15 +
 *   imageQuality * 0.1 +
 *   priceSignal * 0.05
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceRegistryService } from '../source-registry/source-registry.service';

export interface RankingResult {
  rankingScore: number;
  timerUrgency: number;
  dataCompleteness: number;
  sourceQuality: number;
  imageQuality: number;
  priceSignal: number;
}

@Injectable()
export class AuctionRankingService {
  private readonly logger = new Logger(AuctionRankingService.name);

  constructor(
    private readonly sourceRegistryService: SourceRegistryService,
  ) {}

  /**
   * Calculate ranking for an auction
   */
  async rankAuction(auction: any): Promise<RankingResult> {
    const auctionConfidence = this.clamp(auction.confidence || 0);
    const timerUrgency = this.computeTimerUrgency(auction.auctionDate);
    const dataCompleteness = this.computeDataCompleteness(auction);
    const sourceQuality = await this.computeSourceQuality(auction.source);
    const imageQuality = this.computeImageQuality(auction.images);
    const priceSignal = auction.price && auction.price > 0 ? 1 : 0;

    const rankingScore = Number(
      (
        auctionConfidence * 0.25 +
        timerUrgency * 0.25 +
        dataCompleteness * 0.2 +
        sourceQuality * 0.15 +
        imageQuality * 0.1 +
        priceSignal * 0.05
      ).toFixed(3),
    );

    return {
      rankingScore,
      timerUrgency,
      dataCompleteness,
      sourceQuality,
      imageQuality,
      priceSignal,
    };
  }

  /**
   * Timer urgency - closer auctions get higher score
   */
  private computeTimerUrgency(auctionDate?: Date): number {
    if (!auctionDate) return 0;

    const diffMs = new Date(auctionDate).getTime() - Date.now();
    const hours = diffMs / (1000 * 60 * 60);

    if (hours <= 0) return 0; // Already started/ended
    if (hours <= 3) return 1;
    if (hours <= 12) return 0.9;
    if (hours <= 24) return 0.8;
    if (hours <= 48) return 0.6;
    if (hours <= 96) return 0.4;
    return 0.2;
  }

  /**
   * Data completeness - more data = higher score
   */
  private computeDataCompleteness(auction: any): number {
    let score = 0;

    if (auction.vin) score += 0.2;
    if (auction.lotNumber) score += 0.15;
    if (auction.auctionDate) score += 0.2;
    if (auction.location) score += 0.1;
    if (auction.price && auction.price > 0) score += 0.15;
    if (auction.images && auction.images.length > 0) score += 0.1;
    if (auction.title) score += 0.05;
    if (auction.make) score += 0.025;
    if (auction.model) score += 0.025;

    return Number(Math.min(1, score).toFixed(3));
  }

  /**
   * Source quality from registry
   */
  private async computeSourceQuality(sourceName?: string): Promise<number> {
    if (!sourceName) return 0.5;

    try {
      const sources = await this.sourceRegistryService.getAll();
      const src = sources.find((s: any) => s.name === sourceName);

      if (!src) return 0.5;

      return Number(
        Math.max(0.1, Math.min(1, src.effectiveWeight || 0.5)).toFixed(3),
      );
    } catch {
      return 0.5;
    }
  }

  /**
   * Image quality based on count
   */
  private computeImageQuality(images?: string[]): number {
    const count = images?.length || 0;

    if (count >= 10) return 1;
    if (count >= 6) return 0.8;
    if (count >= 3) return 0.6;
    if (count >= 1) return 0.4;
    return 0;
  }

  /**
   * Clamp value between 0 and 1
   */
  private clamp(value: number): number {
    return Number(Math.max(0, Math.min(1, value)).toFixed(3));
  }
}
