import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsTrackingService } from './analytics-tracking.service';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { AnalyticsEventSchema } from './analytics-event.schema';
import { LeadSchema } from '../leads/lead.schema';
import { DealSchema } from '../deals/deal.schema';
import { QuoteSchema } from '../calculator/schemas/quote.schema';

/**
 * Analytics Tracking Module
 * 
 * Lightweight tracking + Dashboard:
 * - Event collection with buffer/batch
 * - Source attribution (UTM)
 * - Funnel analysis
 * - Fake traffic detection
 * - Campaign tracking
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'AnalyticsEvent', schema: AnalyticsEventSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Quote', schema: QuoteSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsTrackingService,
    AnalyticsDashboardService,
  ],
  exports: [
    AnalyticsTrackingService,
    AnalyticsDashboardService,
  ],
})
export class AnalyticsTrackingModule {}
