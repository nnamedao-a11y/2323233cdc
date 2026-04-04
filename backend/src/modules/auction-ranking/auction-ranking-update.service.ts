/**
 * Auction Ranking Update Service
 * 
 * Оновлює ranking scores в базі даних
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Auction, AuctionDocument } from './auction.schema';
import { AuctionRankingService } from './auction-ranking.service';

@Injectable()
export class AuctionRankingUpdateService {
  private readonly logger = new Logger(AuctionRankingUpdateService.name);

  constructor(
    @InjectModel(Auction.name)
    private readonly auctionModel: Model<AuctionDocument>,
    private readonly rankingService: AuctionRankingService,
  ) {}

  /**
   * Recompute ranking for single auction
   */
  async recomputeForAuction(auctionId: string) {
    const auction = await this.auctionModel.findById(auctionId).lean();
    if (!auction) return null;

    const ranking = await this.rankingService.rankAuction(auction);

    return this.auctionModel.findByIdAndUpdate(
      auctionId,
      { $set: ranking },
      { new: true },
    );
  }

  /**
   * Recompute ranking for all active auctions
   */
  async recomputeAllActive(): Promise<{ updated: number; failed: number }> {
    const activeAuctions = await this.auctionModel.find({
      isActive: true,
      auctionDate: { $gte: new Date() },
    });

    let updated = 0;
    let failed = 0;

    for (const auction of activeAuctions) {
      try {
        const ranking = await this.rankingService.rankAuction(auction);
        
        await this.auctionModel.updateOne(
          { _id: auction._id },
          { $set: ranking },
        );
        
        updated++;
      } catch (error) {
        failed++;
      }
    }

    this.logger.log(`Recomputed rankings: ${updated} updated, ${failed} failed`);
    return { updated, failed };
  }

  /**
   * Mark expired auctions as inactive
   */
  async deactivateExpiredAuctions(): Promise<number> {
    const result = await this.auctionModel.updateMany(
      {
        isActive: true,
        auctionDate: { $lt: new Date() },
      },
      {
        $set: { isActive: false },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Deactivated ${result.modifiedCount} expired auctions`);
    }

    return result.modifiedCount;
  }
}
