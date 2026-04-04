import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Deposit, DepositSchema } from '../deposits/deposit.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Deal.name, schema: DealSchema },
      { name: Deposit.name, schema: DepositSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
