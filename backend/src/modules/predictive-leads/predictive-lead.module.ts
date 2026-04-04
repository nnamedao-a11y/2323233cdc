import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PredictiveLeadController } from './predictive-lead.controller';
import { PredictiveLeadService } from './predictive-lead.service';
import { PredictiveScoreService } from './services/predictive-score.service';
import { PredictiveActionService } from './services/predictive-action.service';
import { Lead, LeadSchema } from '../leads/lead.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
    ]),
  ],
  controllers: [PredictiveLeadController],
  providers: [
    PredictiveLeadService,
    PredictiveScoreService,
    PredictiveActionService,
  ],
  exports: [PredictiveLeadService],
})
export class PredictiveLeadModule {}
