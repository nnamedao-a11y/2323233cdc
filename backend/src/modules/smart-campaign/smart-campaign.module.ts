/**
 * Smart Campaign Module
 * 
 * AI-powered campaign system:
 * - Audience Engine (кому писати)
 * - Timing Engine (коли писати)
 * - Message AI (що писати - персоналізація)
 * - Auto Campaigns (auction triggers)
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { SmartCampaignService } from './smart-campaign.service';
import { SmartCampaignController } from './smart-campaign.controller';
import { AudienceService } from './services/audience.service';
import { TimingService } from './services/timing.service';
import { MessageAIService } from './services/message-ai.service';
import { AutoCampaignService } from './services/auto-campaign.service';
import { CampaignFeedbackService } from './services/campaign-feedback.service';

import { SmartCampaignLog, SmartCampaignLogSchema } from './schemas/smart-campaign-log.schema';
import { CampaignFeedback, CampaignFeedbackSchema } from './schemas/campaign-feedback.schema';
import { Favorite, FavoriteSchema } from '../user-engagement/favorites/schemas/favorite.schema';
import { CompareList, CompareListSchema } from '../user-engagement/compare/schemas/compare-list.schema';
import { IntentScore, IntentScoreSchema } from '../reminder-workflow/schemas/intent-score.schema';

import { AutoCallModule } from '../auto-call/auto-call.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SmartCampaignLog.name, schema: SmartCampaignLogSchema },
      { name: CampaignFeedback.name, schema: CampaignFeedbackSchema },
      { name: Favorite.name, schema: FavoriteSchema },
      { name: CompareList.name, schema: CompareListSchema },
      { name: IntentScore.name, schema: IntentScoreSchema },
    ]),
    ScheduleModule.forRoot(),
    forwardRef(() => AutoCallModule),
    forwardRef(() => TelegramBotModule),
  ],
  controllers: [SmartCampaignController],
  providers: [
    SmartCampaignService,
    AudienceService,
    TimingService,
    MessageAIService,
    AutoCampaignService,
    CampaignFeedbackService,
  ],
  exports: [SmartCampaignService, AutoCampaignService],
})
export class SmartCampaignModule {}
