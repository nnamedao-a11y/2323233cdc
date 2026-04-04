/**
 * BIBI Cars - Cadence Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CadenceService } from './cadence.service';
import { CadenceController } from './cadence.controller';
import { CadenceHandler } from './cadence.handler';
import { CadenceCron } from './cadence.cron';
import { Cadence, CadenceSchema } from './schemas/cadence.schema';
import { CadenceRun, CadenceRunSchema } from './schemas/cadence-run.schema';
import { CadenceExecutionLog, CadenceExecutionLogSchema } from './schemas/cadence-execution-log.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Invoice, InvoiceSchema } from '../payments/invoice.schema';
import { Shipment, ShipmentSchema } from '../shipping/shipment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cadence.name, schema: CadenceSchema },
      { name: CadenceRun.name, schema: CadenceRunSchema },
      { name: CadenceExecutionLog.name, schema: CadenceExecutionLogSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Invoice', schema: InvoiceSchema },
      { name: 'Shipment', schema: ShipmentSchema },
    ]),
  ],
  controllers: [CadenceController],
  providers: [CadenceService, CadenceHandler, CadenceCron],
  exports: [CadenceService],
})
export class CadenceModule {}
