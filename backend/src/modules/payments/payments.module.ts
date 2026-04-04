/**
 * Payments Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { PaymentsController, PaymentsPackagesController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { PaymentFlowModule } from '../payment-flow/payment-flow.module';
import { AuthModule } from '../auth/auth.module';
import { Deal, DealSchema } from '../deals/deal.schema';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Deal.name, schema: DealSchema },
    ]),
    forwardRef(() => PaymentFlowModule),
    forwardRef(() => AuthModule),
    forwardRef(() => IntegrationConfigModule),
  ],
  controllers: [PaymentsController, PaymentsPackagesController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
