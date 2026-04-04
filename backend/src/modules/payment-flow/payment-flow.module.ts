/**
 * Payment Flow Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentFlowController } from './payment-flow.controller';
import { PaymentFlowService } from './payment-flow.service';
import { PaymentFlowState, PaymentFlowStateSchema } from './payment-flow.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentFlowState.name, schema: PaymentFlowStateSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [PaymentFlowController],
  providers: [PaymentFlowService],
  exports: [PaymentFlowService],
})
export class PaymentFlowModule {}
