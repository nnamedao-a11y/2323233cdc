/**
 * Calculator Module
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CalculatorController } from './calculator.controller';
import { CalculatorEngineService } from './calculator-engine.service';
import { CalculatorAdminService } from './calculator-admin.service';
import { CalculatorProfile, CalculatorProfileSchema, CalculatorProfileDocument } from './schemas/calculator-profile.schema';
import { RouteRate, RouteRateSchema, RouteRateDocument } from './schemas/route-rate.schema';
import { AuctionFeeRule, AuctionFeeRuleSchema, AuctionFeeRuleDocument } from './schemas/auction-fee-rule.schema';
import { Quote, QuoteSchema } from './schemas/quote.schema';
import { Logger } from '@nestjs/common';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CalculatorProfile.name, schema: CalculatorProfileSchema },
      { name: RouteRate.name, schema: RouteRateSchema },
      { name: AuctionFeeRule.name, schema: AuctionFeeRuleSchema },
      { name: Quote.name, schema: QuoteSchema },
    ]),
  ],
  controllers: [CalculatorController],
  providers: [CalculatorEngineService, CalculatorAdminService],
  exports: [CalculatorEngineService, CalculatorAdminService],
})
export class CalculatorModule implements OnModuleInit {
  private readonly logger = new Logger(CalculatorModule.name);

  constructor(
    @InjectModel(CalculatorProfile.name)
    private readonly profileModel: Model<CalculatorProfileDocument>,
    @InjectModel(RouteRate.name)
    private readonly routeRateModel: Model<RouteRateDocument>,
    @InjectModel(AuctionFeeRule.name)
    private readonly auctionFeeRuleModel: Model<AuctionFeeRuleDocument>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultData();
  }

  private async seedDefaultData() {
    const existingProfile = await this.profileModel.findOne({ code: 'default-bg' });
    
    if (existingProfile) {
      this.logger.log('[Calculator] Default profile already exists');
      return;
    }

    this.logger.log('[Calculator] Seeding default calculator data...');

    // Create default profile
    await this.profileModel.create({
      code: 'default-bg',
      name: 'Default Bulgaria Profile',
      isActive: true,
      destinationCountry: 'BG',
      currency: 'USD',
      insuranceRate: 0.02,
      usaHandlingFee: 150,
      bankFee: 100,
      euPortHandlingFee: 600,
      companyFee: 940,
      customsRate: 0.1,
      hiddenFeeThreshold: 5000,
      hiddenFeeUnder5000: 700,
      hiddenFeeOver5000: 1400,
      documentationFee: 50,
      titleFee: 75,
    });

    // Seed route rates
    const routeRates = [
      // USA Inland Delivery (to port)
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'NJ', vehicleType: 'sedan', amount: 475 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'NJ', vehicleType: 'suv', amount: 475 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'NJ', vehicleType: 'bigSUV', amount: 525 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'NJ', vehicleType: 'pickup', amount: 525 },
      
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'GA', vehicleType: 'sedan', amount: 450 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'GA', vehicleType: 'suv', amount: 450 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'GA', vehicleType: 'bigSUV', amount: 500 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'GA', vehicleType: 'pickup', amount: 500 },
      
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'TX', vehicleType: 'sedan', amount: 550 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'TX', vehicleType: 'suv', amount: 550 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'TX', vehicleType: 'bigSUV', amount: 600 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'TX', vehicleType: 'pickup', amount: 600 },
      
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'CA', vehicleType: 'sedan', amount: 900 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'CA', vehicleType: 'suv', amount: 900 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'CA', vehicleType: 'bigSUV', amount: 1000 },
      { profileCode: 'default-bg', rateType: 'usa_inland', originCode: 'CA', vehicleType: 'pickup', amount: 1000 },

      // Ocean Freight
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'NJ', vehicleType: 'sedan', amount: 525 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'NJ', vehicleType: 'suv', amount: 700 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'NJ', vehicleType: 'bigSUV', amount: 800 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'NJ', vehicleType: 'pickup', amount: 800 },
      
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'GA', vehicleType: 'sedan', amount: 500 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'GA', vehicleType: 'suv', amount: 650 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'GA', vehicleType: 'bigSUV', amount: 750 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'GA', vehicleType: 'pickup', amount: 750 },
      
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'TX', vehicleType: 'sedan', amount: 600 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'TX', vehicleType: 'suv', amount: 950 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'TX', vehicleType: 'bigSUV', amount: 1050 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'TX', vehicleType: 'pickup', amount: 1050 },
      
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'CA', vehicleType: 'sedan', amount: 950 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'CA', vehicleType: 'suv', amount: 1450 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'CA', vehicleType: 'bigSUV', amount: 1550 },
      { profileCode: 'default-bg', rateType: 'ocean', originCode: 'CA', vehicleType: 'pickup', amount: 1550 },

      // EU Delivery (to Bulgaria)
      { profileCode: 'default-bg', rateType: 'eu_delivery', destinationCode: 'BG', vehicleType: 'sedan', amount: 1200 },
      { profileCode: 'default-bg', rateType: 'eu_delivery', destinationCode: 'BG', vehicleType: 'suv', amount: 1400 },
      { profileCode: 'default-bg', rateType: 'eu_delivery', destinationCode: 'BG', vehicleType: 'bigSUV', amount: 1600 },
      { profileCode: 'default-bg', rateType: 'eu_delivery', destinationCode: 'BG', vehicleType: 'pickup', amount: 1600 },
    ];

    await this.routeRateModel.insertMany(routeRates);

    // Seed auction fee rules (brackets)
    const auctionFeeRules = [
      { profileCode: 'default-bg', minBid: 0, maxBid: 999, fee: 300, description: 'Under $1,000' },
      { profileCode: 'default-bg', minBid: 1000, maxBid: 2999, fee: 450, description: '$1,000 - $2,999' },
      { profileCode: 'default-bg', minBid: 3000, maxBid: 4999, fee: 600, description: '$3,000 - $4,999' },
      { profileCode: 'default-bg', minBid: 5000, maxBid: 7499, fee: 750, description: '$5,000 - $7,499' },
      { profileCode: 'default-bg', minBid: 7500, maxBid: 9999, fee: 850, description: '$7,500 - $9,999' },
      { profileCode: 'default-bg', minBid: 10000, maxBid: 14999, fee: 1000, description: '$10,000 - $14,999' },
      { profileCode: 'default-bg', minBid: 15000, maxBid: 24999, fee: 1200, description: '$15,000 - $24,999' },
      { profileCode: 'default-bg', minBid: 25000, maxBid: 49999, fee: 1500, description: '$25,000 - $49,999' },
      { profileCode: 'default-bg', minBid: 50000, maxBid: 99999999, fee: 2000, description: '$50,000+' },
    ];

    await this.auctionFeeRuleModel.insertMany(auctionFeeRules);

    this.logger.log('[Calculator] Default data seeded successfully');
  }
}
