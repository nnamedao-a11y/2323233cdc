/**
 * Deal Engine Module
 * 
 * Full deal evaluation system:
 * - Profit calculation
 * - Risk assessment
 * - Deal scoring
 * - Recommendations
 */

import { Module } from '@nestjs/common';
import { DealEngineController } from './deal-engine.controller';
import { DealEngineService } from './deal-engine.service';
import { DealProfitService } from './services/deal-profit.service';
import { DealRiskService } from './services/deal-risk.service';
import { DealScoreService } from './services/deal-score.service';
import { DealRecommendationService } from './services/deal-recommendation.service';

@Module({
  controllers: [DealEngineController],
  providers: [
    DealEngineService,
    DealProfitService,
    DealRiskService,
    DealScoreService,
    DealRecommendationService,
  ],
  exports: [DealEngineService],
})
export class DealEngineModule {}
