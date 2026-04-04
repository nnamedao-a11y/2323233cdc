/**
 * Calculator Admin Service
 * 
 * Управління конфігурацією калькулятора через адмінку
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CalculatorProfile, CalculatorProfileDocument } from './schemas/calculator-profile.schema';
import { RouteRate, RouteRateDocument } from './schemas/route-rate.schema';
import { AuctionFeeRule, AuctionFeeRuleDocument } from './schemas/auction-fee-rule.schema';
import { Quote, QuoteDocument } from './schemas/quote.schema';
import { UpdateProfileDto, UpsertRouteRateDto, UpsertAuctionFeeRuleDto } from './dto/calculate-delivery.dto';

@Injectable()
export class CalculatorAdminService {
  private readonly logger = new Logger(CalculatorAdminService.name);

  constructor(
    @InjectModel(CalculatorProfile.name)
    private readonly profileModel: Model<CalculatorProfileDocument>,
    @InjectModel(RouteRate.name)
    private readonly routeRateModel: Model<RouteRateDocument>,
    @InjectModel(AuctionFeeRule.name)
    private readonly auctionFeeRuleModel: Model<AuctionFeeRuleDocument>,
    @InjectModel(Quote.name)
    private readonly quoteModel: Model<QuoteDocument>,
  ) {}

  // ============ PROFILE ============

  async getActiveProfile() {
    return this.profileModel.findOne({ isActive: true }).lean();
  }

  async getAllProfiles() {
    return this.profileModel.find().sort({ isActive: -1, name: 1 }).lean();
  }

  async updateProfile(dto: UpdateProfileDto) {
    const updated = await this.profileModel.findOneAndUpdate(
      { isActive: true },
      { $set: dto },
      { new: true },
    );
    
    this.logger.log(`[Admin] Profile updated: ${JSON.stringify(dto)}`);
    return updated;
  }

  async createProfile(data: Partial<CalculatorProfile>) {
    // Deactivate other profiles if this one is active
    if (data.isActive) {
      await this.profileModel.updateMany({}, { $set: { isActive: false } });
    }
    
    return this.profileModel.create(data);
  }

  // ============ ROUTE RATES ============

  async getRouteRates(profileCode: string) {
    return this.routeRateModel.find({ profileCode, isActive: true })
      .sort({ rateType: 1, originCode: 1, vehicleType: 1 })
      .lean();
  }

  async getRouteRatesGrouped(profileCode: string) {
    const rates = await this.getRouteRates(profileCode);
    
    const grouped = {
      usa_inland: {},
      ocean: {},
      eu_delivery: {},
    };

    for (const rate of rates) {
      const key = rate.rateType;
      const locationKey = rate.originCode || rate.destinationCode || 'default';
      
      if (!grouped[key][locationKey]) {
        grouped[key][locationKey] = {};
      }
      
      grouped[key][locationKey][rate.vehicleType] = rate.amount;
    }

    return grouped;
  }

  async upsertRouteRate(dto: UpsertRouteRateDto) {
    const filter = {
      profileCode: dto.profileCode,
      rateType: dto.rateType,
      originCode: dto.originCode,
      destinationCode: dto.destinationCode,
      vehicleType: dto.vehicleType,
    };

    const updated = await this.routeRateModel.findOneAndUpdate(
      filter,
      { $set: { ...dto, isActive: true } },
      { upsert: true, new: true },
    );

    this.logger.log(`[Admin] Route rate upserted: ${dto.rateType}/${dto.originCode || dto.destinationCode}/${dto.vehicleType} = $${dto.amount}`);
    return updated;
  }

  async bulkUpsertRouteRates(rates: UpsertRouteRateDto[]) {
    const results = await Promise.all(
      rates.map(rate => this.upsertRouteRate(rate))
    );
    return results;
  }

  async deleteRouteRate(id: string) {
    return this.routeRateModel.findByIdAndUpdate(id, { isActive: false });
  }

  // ============ AUCTION FEES ============

  async getAuctionFeeRules(profileCode: string) {
    return this.auctionFeeRuleModel.find({ profileCode, isActive: true })
      .sort({ minBid: 1 })
      .lean();
  }

  async upsertAuctionFeeRule(dto: UpsertAuctionFeeRuleDto) {
    const filter = {
      profileCode: dto.profileCode,
      minBid: dto.minBid,
      maxBid: dto.maxBid,
    };

    const updated = await this.auctionFeeRuleModel.findOneAndUpdate(
      filter,
      { $set: { ...dto, isActive: true } },
      { upsert: true, new: true },
    );

    this.logger.log(`[Admin] Auction fee rule upserted: $${dto.minBid}-$${dto.maxBid} → $${dto.fee}`);
    return updated;
  }

  async deleteAuctionFeeRule(id: string) {
    return this.auctionFeeRuleModel.findByIdAndUpdate(id, { isActive: false });
  }

  // ============ QUOTES ============

  async getQuotes(filters: { status?: string; limit?: number }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;

    return this.quoteModel.find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50)
      .lean();
  }

  async updateQuoteStatus(id: string, status: string) {
    return this.quoteModel.findByIdAndUpdate(id, { status }, { new: true });
  }

  // ============ STATS ============

  async getCalculatorStats() {
    const [quotesCount, quotesTotal, profilesCount] = await Promise.all([
      this.quoteModel.countDocuments(),
      this.quoteModel.aggregate([
        { $group: { _id: null, total: { $sum: '$visibleTotal' } } }
      ]),
      this.profileModel.countDocuments(),
    ]);

    const activeProfile = await this.getActiveProfile();

    return {
      totalQuotes: quotesCount,
      totalQuotedValue: quotesTotal[0]?.total || 0,
      profiles: profilesCount,
      activeProfile: activeProfile?.name || 'None',
    };
  }
}
