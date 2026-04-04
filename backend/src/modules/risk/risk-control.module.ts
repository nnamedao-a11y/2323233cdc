/**
 * Risk Control Module
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RiskControlController } from './risk-control.controller';
import { RiskControlService } from './risk-control.service';
import { CarfaxRequest, CarfaxRequestSchema } from '../carfax/carfax.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Call, CallSchema } from '../ringostat/call.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { StaffSession, StaffSessionSchema } from '../staff-sessions/staff-session.schema';
import { User, UserSchema } from '../users/user.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'CarfaxRequest', schema: CarfaxRequestSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Call', schema: CallSchema },
      { name: 'Task', schema: TaskSchema },
      { name: 'StaffSession', schema: StaffSessionSchema },
      { name: 'User', schema: UserSchema },
      { name: 'Customer', schema: CustomerSchema },
    ]),
    AlertsModule,
  ],
  controllers: [RiskControlController],
  providers: [RiskControlService],
  exports: [RiskControlService],
})
export class RiskControlModule {}
