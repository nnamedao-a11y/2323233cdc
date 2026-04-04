/**
 * Auction Ranking Controller
 * 
 * Public API для отримання ranked auctions
 */

import { Controller, Get, Query, Param } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Auction, AuctionDocument } from './auction.schema';
import { AuctionService } from './auction.service';

@Controller('auction-ranking')
export class AuctionRankingController {
  constructor(
    @InjectModel(Auction.name)
    private readonly auctionModel: Model<AuctionDocument>,
    private readonly auctionService: AuctionService,
  ) {}

  /**
   * GET /api/auction-ranking/top - топ аукціони за ranking
   */
  @Get('top')
  async getTop(@Query('limit') limit = '20') {
    return this.auctionModel
      .find({
        isActive: true,
        auctionDate: { $gte: new Date() },
      })
      .sort({ rankingScore: -1, auctionDate: 1 })
      .limit(Number(limit))
      .select('-__v')
      .lean();
  }

  /**
   * GET /api/auction-ranking/ending-soon - аукціони що скоро закінчуються
   */
  @Get('ending-soon')
  async getEndingSoon(@Query('limit') limit = '20') {
    const maxDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    
    return this.auctionModel
      .find({
        isActive: true,
        auctionDate: { 
          $gte: new Date(),
          $lte: maxDate,
        },
      })
      .sort({ auctionDate: 1, rankingScore: -1 })
      .limit(Number(limit))
      .select('-__v')
      .lean();
  }

  /**
   * GET /api/auction-ranking/hot - гарячі аукціони (high ranking)
   */
  @Get('hot')
  async getHot(@Query('limit') limit = '20') {
    return this.auctionModel
      .find({
        isActive: true,
        auctionDate: { $gte: new Date() },
        rankingScore: { $gte: 0.5 },
      })
      .sort({ rankingScore: -1 })
      .limit(Number(limit))
      .select('-__v')
      .lean();
  }

  /**
   * GET /api/auction-ranking/upcoming - майбутні аукціони
   */
  @Get('upcoming')
  async getUpcoming(@Query('limit') limit = '20', @Query('days') days = '7') {
    const maxDate = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
    
    return this.auctionModel
      .find({
        isActive: true,
        auctionDate: {
          $gte: new Date(),
          $lte: maxDate,
        },
      })
      .sort({ auctionDate: 1 })
      .limit(Number(limit))
      .select('-__v')
      .lean();
  }

  /**
   * GET /api/auction-ranking/stats - статистика
   */
  @Get('stats')
  async getStats() {
    return this.auctionService.getStats();
  }

  /**
   * GET /api/auction-ranking/vehicle/:vin - аукціони по VIN
   */
  @Get('vehicle/:vin')
  async getByVin(@Param('vin') vin: string) {
    return this.auctionService.getByVin(vin);
  }
}
