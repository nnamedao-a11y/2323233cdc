/**
 * Advanced Analytics Module
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdvancedAnalyticsController } from './advanced-analytics.controller';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Call, CallSchema } from '../ringostat/call.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { Invoice, InvoiceSchema } from '../payments/invoice.schema';
import { Contract, ContractSchema } from '../contracts/contract.schema';
import { Shipment, ShipmentSchema } from '../shipping/shipment.schema';
import { CarfaxRequest, CarfaxRequestSchema } from '../carfax/carfax.schema';
import { User, UserSchema } from '../users/user.schema';
import { Deal, DealSchema } from '../deals/deal.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Lead', schema: LeadSchema },
      { name: 'Call', schema: CallSchema },
      { name: 'Task', schema: TaskSchema },
      { name: 'Invoice', schema: InvoiceSchema },
      { name: 'Contract', schema: ContractSchema },
      { name: 'Shipment', schema: ShipmentSchema },
      { name: 'CarfaxRequest', schema: CarfaxRequestSchema },
      { name: 'User', schema: UserSchema },
      { name: 'Deal', schema: DealSchema },
    ]),
  ],
  controllers: [AdvancedAnalyticsController],
  providers: [AdvancedAnalyticsService],
  exports: [AdvancedAnalyticsService],
})
export class AdvancedAnalyticsModule {}
