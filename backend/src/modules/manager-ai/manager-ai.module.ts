/**
 * Manager AI Module
 * 
 * AI-powered sales recommendations for managers
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ManagerAIService } from './manager-ai.service';
import { ManagerAIController } from './manager-ai.controller';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { IntentScore, IntentScoreSchema } from '../reminder-workflow/schemas/intent-score.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: IntentScore.name, schema: IntentScoreSchema },
    ]),
  ],
  controllers: [ManagerAIController],
  providers: [ManagerAIService],
  exports: [ManagerAIService],
})
export class ManagerAIModule {}
