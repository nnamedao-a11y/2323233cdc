/**
 * Revenue Advisor Module
 * 
 * Decision Support System для менеджерів:
 * - Рекомендації по знижках
 * - Оцінка ймовірності закриття угоди
 * - Data-backed advice
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RevenueAdvisorService } from './revenue-advisor.service';
import { RevenueAdvisorController } from './revenue-advisor.controller';
import { RevenueRulesService } from './services/revenue-rules.service';
import { RevenueExplainService } from './services/revenue-explain.service';
import { RevenueLearningService } from './services/revenue-learning.service';

import { RevenueOutcome, RevenueOutcomeSchema } from './schemas/revenue-outcome.schema';
import { RevenuePattern, RevenuePatternSchema } from './schemas/revenue-pattern.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RevenueOutcome.name, schema: RevenueOutcomeSchema },
      { name: RevenuePattern.name, schema: RevenuePatternSchema },
    ]),
  ],
  controllers: [RevenueAdvisorController],
  providers: [
    RevenueAdvisorService,
    RevenueRulesService,
    RevenueExplainService,
    RevenueLearningService,
  ],
  exports: [RevenueAdvisorService, RevenueLearningService],
})
export class RevenueAdvisorModule {}
