/**
 * BIBI Cars - Owner Dashboard Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OwnerDashboardService } from './owner-dashboard.service';
import { OwnerDashboardController } from './owner-dashboard.controller';
import { ScoringModule } from '../scoring/scoring.module';
import { JourneyModule } from '../journey/journey.module';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Invoice, InvoiceSchema } from '../payments/invoice.schema';
import { Shipment, ShipmentSchema } from '../shipping/shipment.schema';
import { User, UserSchema } from '../users/user.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { StaffSession, StaffSessionSchema } from '../staff-auth/schemas/staff-session.schema';

@Module({
  imports: [
    ScoringModule,
    JourneyModule,
    forwardRef(() => IntegrationConfigModule),
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Deal.name, schema: DealSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Shipment.name, schema: ShipmentSchema },
      { name: User.name, schema: UserSchema },
      { name: Task.name, schema: TaskSchema },
      { name: StaffSession.name, schema: StaffSessionSchema },
    ]),
  ],
  providers: [OwnerDashboardService],
  controllers: [OwnerDashboardController],
  exports: [OwnerDashboardService],
})
export class OwnerDashboardModule {}
