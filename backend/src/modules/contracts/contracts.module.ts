/**
 * Contracts Module
 * 
 * E-signature contract management
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractPdfService } from './contract-pdf.service';
import { ContractEmailService } from './contract-email.service';
import { Contract, ContractSchema } from './contract.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Invoice, InvoiceSchema } from '../payments/invoice.schema';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Invoice', schema: InvoiceSchema },
      { name: 'User', schema: UserSchema },
    ]),
  ],
  controllers: [ContractsController],
  providers: [ContractsService, ContractPdfService, ContractEmailService],
  exports: [ContractsService, ContractPdfService, ContractEmailService],
})
export class ContractsModule {}
