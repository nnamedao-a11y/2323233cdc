import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { CoachingDetectorService } from './services/coaching-detector.service';
import { CoachingValidatorService } from './services/coaching-validator.service';
import { CoachingAdviceService } from './services/coaching-advice.service';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { KPIModule } from '../kpi/kpi.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Deal.name, schema: DealSchema },
    ]),
    KPIModule,
  ],
  controllers: [CoachingController],
  providers: [
    CoachingService,
    CoachingDetectorService,
    CoachingValidatorService,
    CoachingAdviceService,
  ],
  exports: [CoachingService],
})
export class CoachingModule {}
