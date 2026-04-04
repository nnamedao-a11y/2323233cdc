/**
 * Auction Classifier Service
 * 
 * Визначає чи є авто на аукціоні та валідує дату аукціону
 */

import { Injectable, Logger } from '@nestjs/common';

export interface AuctionInfo {
  isAuction: boolean;
  auctionDate: Date | null;
  auctionStatus: 'upcoming' | 'live' | 'ended' | 'unknown';
  daysUntilAuction: number | null;
  confidence: number;
}

@Injectable()
export class AuctionClassifierService {
  private readonly logger = new Logger(AuctionClassifierService.name);

  classify(vehicle: any): AuctionInfo {
    const indicators: number[] = [];
    
    // Check sale date
    const saleDate = vehicle.saleDate || vehicle.auctionDate;
    if (saleDate) {
      indicators.push(1);
    }
    
    // Check for auction-related fields
    if (vehicle.lotNumber || vehicle.ln) {
      indicators.push(1);
    }
    
    // Check title keywords
    const title = (vehicle.title || '').toLowerCase();
    const auctionKeywords = ['lot', 'auction', 'bid', 'copart', 'iaai', 'salvage'];
    if (auctionKeywords.some(kw => title.includes(kw))) {
      indicators.push(1);
    }
    
    // Check source
    const source = (vehicle.source || '').toLowerCase();
    if (['copart', 'iaai', 'manheim', 'adesa'].includes(source)) {
      indicators.push(1);
    }
    
    // Check for bid/price info
    if (vehicle.currentBid || vehicle.obc) {
      indicators.push(1);
    }

    const score = indicators.length;
    const isAuction = score >= 2;

    // Determine auction status
    let auctionStatus: 'upcoming' | 'live' | 'ended' | 'unknown' = 'unknown';
    let daysUntilAuction: number | null = null;
    let auctionDate: Date | null = null;

    if (saleDate) {
      auctionDate = new Date(saleDate);
      const now = new Date();
      const diffMs = auctionDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      daysUntilAuction = diffDays;
      
      if (diffDays > 0) {
        auctionStatus = 'upcoming';
      } else if (diffDays === 0) {
        auctionStatus = 'live';
      } else {
        auctionStatus = 'ended';
      }
    }

    return {
      isAuction,
      auctionDate,
      auctionStatus,
      daysUntilAuction,
      confidence: score / 5,
    };
  }

  /**
   * Filter only upcoming auctions
   */
  isUpcoming(vehicle: any): boolean {
    const info = this.classify(vehicle);
    return info.isAuction && info.auctionStatus === 'upcoming';
  }

  /**
   * Get days until auction
   */
  getDaysUntil(vehicle: any): number | null {
    const info = this.classify(vehicle);
    return info.daysUntilAuction;
  }
}
