import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RevenueAiController } from './revenue-ai.controller';
import { IntentScoringService } from './intent-scoring.service';
import { DynamicPricingService } from './dynamic-pricing.service';
import { ManagerAiAssistService } from './manager-ai-assist.service';
import { CustomerSavedListingSchema } from '../customer-auth/schemas/customer-saved-listing.schema';
import { CustomerRecentlyViewedSchema } from '../customer-auth/schemas/customer-recently-viewed.schema';
import { CustomerSchema } from '../customers/customer.schema';
import { QuoteSchema } from '../calculator/schemas/quote.schema';
import { DealSchema } from '../deals/deal.schema';
import { DepositSchema } from '../deposits/deposit.schema';

/**
 * Revenue AI Module
 * 
 * AI-powered revenue optimization:
 * - Intent Scoring (cold/warm/hot)
 * - Dynamic Pricing
 * - Manager AI Assist
 * - Discount Recommendations
 * - Deal Closing Logic
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'CustomerSavedListing', schema: CustomerSavedListingSchema },
      { name: 'CustomerRecentlyViewed', schema: CustomerRecentlyViewedSchema },
      { name: 'Customer', schema: CustomerSchema },
      { name: 'Quote', schema: QuoteSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Deposit', schema: DepositSchema },
    ]),
  ],
  controllers: [RevenueAiController],
  providers: [
    IntentScoringService,
    DynamicPricingService,
    ManagerAiAssistService,
  ],
  exports: [
    IntentScoringService,
    DynamicPricingService,
    ManagerAiAssistService,
  ],
})
export class RevenueAiModule {}
