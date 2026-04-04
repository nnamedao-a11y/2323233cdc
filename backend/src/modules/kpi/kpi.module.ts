import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KPIController } from './kpi.controller';
import { KPIService } from './kpi.service';
import { KPIAggregatorService } from './services/kpi-aggregator.service';
import { KPIAlertsService } from './services/kpi-alerts.service';
import { KPIRatingService } from './services/kpi-rating.service';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { User, UserSchema } from '../users/user.schema';
import { Task, TaskSchema } from '../tasks/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Deal.name, schema: DealSchema },
      { name: User.name, schema: UserSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [KPIController],
  providers: [
    KPIService,
    KPIAggregatorService,
    KPIAlertsService,
    KPIRatingService,
  ],
  exports: [KPIService],
})
export class KPIModule {}
