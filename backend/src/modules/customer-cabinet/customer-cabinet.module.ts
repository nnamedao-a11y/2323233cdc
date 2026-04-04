import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerCabinetService } from './customer-cabinet.service';
import { CustomerCabinetController, CabinetHistoryController, CabinetController } from './customer-cabinet.controller';
import { CustomerAccess, CustomerAccessSchema } from './schemas/customer-access.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Quote, QuoteSchema } from '../calculator/schemas/quote.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Deposit, DepositSchema } from '../deposits/deposit.schema';
import { CustomerTimelineEvent, CustomerTimelineEventSchema } from '../customers/customer-timeline-event.schema';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { HistoryReport, HistoryReportSchema } from '../history-reports/history-report.schema';

/**
 * Customer Cabinet Module
 * 
 * Client Process Center
 * 
 * Повний огляд процесу для клієнта:
 * - Dashboard з summary та next action
 * - My Requests (leads)
 * - My Orders (deals) з process stepper
 * - Deposits & Payments
 * - Timeline
 * - Notifications
 * - Profile
 * - History Reports (VIN)
 * - Invoices (NEW)
 * - Shipping (NEW)
 */

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerAccess.name, schema: CustomerAccessSchema },
      { name: 'Customer', schema: CustomerSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Quote', schema: QuoteSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Deposit', schema: DepositSchema },
      { name: 'CustomerTimelineEvent', schema: CustomerTimelineEventSchema },
      { name: 'Notification', schema: NotificationSchema },
      { name: 'HistoryReport', schema: HistoryReportSchema },
    ]),
  ],
  controllers: [CustomerCabinetController, CabinetHistoryController, CabinetController],
  providers: [CustomerCabinetService],
  exports: [CustomerCabinetService],
})
export class CustomerCabinetModule {}
