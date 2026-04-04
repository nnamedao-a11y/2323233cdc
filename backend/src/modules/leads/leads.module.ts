import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { PublicLeadController } from './public-lead.controller';
import { VinLeadController } from './vin-lead.controller';
import { VinLeadService } from './vin-lead.service';
import { Lead, LeadSchema } from './lead.schema';
import { Quote, QuoteSchema } from '../calculator/schemas/quote.schema';
import { AutomationModule } from '../automation/automation.module';
import { ActivityModule } from '../activity/activity.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Quote.name, schema: QuoteSchema },
    ]),
    forwardRef(() => AutomationModule),
    forwardRef(() => TasksModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => CustomersModule),
    ActivityModule,
  ],
  controllers: [LeadsController, PublicLeadController, VinLeadController],
  providers: [LeadsService, VinLeadService],
  exports: [LeadsService, VinLeadService, MongooseModule],
})
export class LeadsModule {}
