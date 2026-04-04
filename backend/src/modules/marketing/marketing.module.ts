import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketingController } from './marketing.controller';
import { FacebookConversionService } from './facebook-conversion.service';
import { AutoBudgetOptimizerService } from './auto-budget-optimizer.service';
import { MarketingPerformanceService } from './marketing-performance.service';
import { MetaAdsService } from './meta-ads.service';
import { AutoActionService } from './auto-action.service';
import { AnalyticsEventSchema } from '../analytics-tracking/analytics-event.schema';
import { LeadSchema } from '../leads/lead.schema';
import { DealSchema } from '../deals/deal.schema';
import { QuoteSchema } from '../calculator/schemas/quote.schema';
import { CampaignSpend, CampaignSpendSchema } from './campaign-spend.schema';
import { AutoAction, AutoActionSchema } from './auto-action.schema';
import { SettingSchema } from '../settings/setting.schema';

/**
 * Marketing Module
 * 
 * Marketing automation and optimization:
 * - Facebook Conversion API
 * - Auto Budget Optimizer
 * - Campaign Performance
 * - ROI Tracking
 * - Meta Ads API (spend sync)
 * - Auto Actions (pause/scale)
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'AnalyticsEvent', schema: AnalyticsEventSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Quote', schema: QuoteSchema },
      { name: CampaignSpend.name, schema: CampaignSpendSchema },
      { name: AutoAction.name, schema: AutoActionSchema },
      { name: 'Setting', schema: SettingSchema },
    ]),
  ],
  controllers: [MarketingController],
  providers: [
    FacebookConversionService,
    AutoBudgetOptimizerService,
    MarketingPerformanceService,
    MetaAdsService,
    AutoActionService,
  ],
  exports: [
    FacebookConversionService,
    AutoBudgetOptimizerService,
    MarketingPerformanceService,
    MetaAdsService,
    AutoActionService,
  ],
})
export class MarketingModule {}
