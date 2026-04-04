/**
 * Auction Service
 * 
 * CRUD операції для аукціонів
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Auction, AuctionDocument } from './auction.schema';
import { AuctionRankingService } from './auction-ranking.service';

export interface CreateAuctionDto {
  vin: string;
  source: string;
  lotNumber?: string;
  auctionDate?: Date;
  location?: string;
  price?: number;
  title?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  damageType?: string;
  images?: string[];
  confidence?: number;
}

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    @InjectModel(Auction.name)
    private readonly auctionModel: Model<AuctionDocument>,
    private readonly rankingService: AuctionRankingService,
  ) {}

  /**
   * Create or update auction from VIN search result
   */
  async upsertFromVinSearch(data: CreateAuctionDto): Promise<Auction> {
    const expiresAt = data.auctionDate
      ? new Date(new Date(data.auctionDate).getTime() + 24 * 60 * 60 * 1000) // +1 day after auction
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

    const auctionData = {
      vin: data.vin,
      source: data.source,
      lotNumber: data.lotNumber || `LOT-${Date.now()}`,
      auctionDate: data.auctionDate,
      location: data.location,
      price: data.price,
      title: data.title,
      make: data.make,
      model: data.model,
      year: data.year,
      mileage: data.mileage,
      damageType: data.damageType,
      images: data.images || [],
      isActive: true,
      confidence: data.confidence || 0.5,
      lastSeenAt: new Date(),
      expiresAt,
    };

    // Calculate ranking
    const ranking = await this.rankingService.rankAuction(auctionData);

    const auction = await this.auctionModel.findOneAndUpdate(
      { vin: data.vin, lotNumber: auctionData.lotNumber },
      {
        $set: {
          ...auctionData,
          ...ranking,
        },
      },
      { upsert: true, new: true },
    );

    return auction;
  }

  /**
   * Get all active auctions
   */
  async getActiveAuctions(limit: number = 50): Promise<Auction[]> {
    return this.auctionModel
      .find({
        isActive: true,
        auctionDate: { $gte: new Date() },
      })
      .sort({ rankingScore: -1, auctionDate: 1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get auction by VIN
   */
  async getByVin(vin: string): Promise<Auction[]> {
    return this.auctionModel
      .find({ vin: vin.toUpperCase() })
      .sort({ auctionDate: -1 })
      .lean();
  }

  /**
   * Get auction by ID
   */
  async getById(id: string): Promise<Auction | null> {
    return this.auctionModel.findById(id).lean();
  }

  /**
   * Get stats
   */
  async getStats() {
    const total = await this.auctionModel.countDocuments();
    const active = await this.auctionModel.countDocuments({ isActive: true });
    const upcoming = await this.auctionModel.countDocuments({
      isActive: true,
      auctionDate: { $gte: new Date() },
    });
    const hot = await this.auctionModel.countDocuments({
      isActive: true,
      rankingScore: { $gte: 0.65 },
    });

    return { total, active, upcoming, hot };
  }
}
