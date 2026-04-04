import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { CustomerTimelineService } from './customer-timeline.service';
import { CustomerOrchestrationService } from './customer-orchestration.service';
import { Customer, CustomerSchema } from './customer.schema';
import { CustomerTimelineEvent, CustomerTimelineEventSchema } from './customer-timeline-event.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Quote, QuoteSchema } from '../calculator/schemas/quote.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Deposit, DepositSchema } from '../deposits/deposit.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerTimelineEvent.name, schema: CustomerTimelineEventSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Quote', schema: QuoteSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Deposit', schema: DepositSchema },
    ]),
  ],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerTimelineService, CustomerOrchestrationService],
  exports: [CustomersService, CustomerTimelineService, CustomerOrchestrationService],
})
export class CustomersModule {}
