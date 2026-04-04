import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { RecommendationProfileService } from './recommendation-profile.service';
import { RecommendationCronService } from './recommendation.cron';
import { RecommendationEventHandler } from './recommendation.events';
import { CustomerSavedListingSchema } from '../customer-auth/schemas/customer-saved-listing.schema';
import { CustomerRecentlyViewedSchema } from '../customer-auth/schemas/customer-recently-viewed.schema';
import { VehicleListingSchema } from '../publishing/schemas/vehicle-listing.schema';
import { CustomerSchema } from '../customers/customer.schema';
import { QuoteSchema } from '../calculator/schemas/quote.schema';
import { DealSchema } from '../deals/deal.schema';

/**
 * Recommendations Module
 * 
 * AI-powered recommendation engine for BIBI Cars CRM
 * 
 * Features:
 * - User preference profiling
 * - Personalized recommendations
 * - "You Missed This" alerts
 * - Auction-soon notifications
 * - Multi-channel delivery (Telegram/Viber)
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'CustomerSavedListing', schema: CustomerSavedListingSchema },
      { name: 'CustomerRecentlyViewed', schema: CustomerRecentlyViewedSchema },
      { name: 'VehicleListing', schema: VehicleListingSchema },
      { name: 'Customer', schema: CustomerSchema },
      { name: 'Quote', schema: QuoteSchema },
      { name: 'Deal', schema: DealSchema },
    ]),
  ],
  controllers: [RecommendationController],
  providers: [
    RecommendationService,
    RecommendationProfileService,
    RecommendationCronService,
    RecommendationEventHandler,
  ],
  exports: [
    RecommendationService,
    RecommendationProfileService,
  ],
})
export class RecommendationsModule {}
