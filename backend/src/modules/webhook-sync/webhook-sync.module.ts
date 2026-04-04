/**
 * Webhook Sync Module
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhookSyncService } from './webhook-sync.service';
import { Invoice, InvoiceSchema } from '../payments/invoice.schema';
import { Contract, ContractSchema } from '../contracts/contract.schema';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';
import { SystemErrorModule } from '../system-errors/system-error.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: 'Contract', schema: ContractSchema },
    ]),
    IntegrationConfigModule,
    SystemErrorModule,
  ],
  providers: [WebhookSyncService],
  exports: [WebhookSyncService],
})
export class WebhookSyncModule {}
