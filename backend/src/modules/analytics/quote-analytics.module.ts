/**
 * Quote Analytics Module
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Quote, QuoteSchema } from '../calculator/schemas/quote.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { QuoteAnalyticsService } from './quote-analytics.service';
import { QuoteAnalyticsController } from './quote-analytics.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quote.name, schema: QuoteSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
  ],
  providers: [QuoteAnalyticsService],
  controllers: [QuoteAnalyticsController],
  exports: [QuoteAnalyticsService],
})
export class QuoteAnalyticsModule {}
