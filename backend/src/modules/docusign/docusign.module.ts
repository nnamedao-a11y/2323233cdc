/**
 * DocuSign Module
 * 
 * Real e-signature integration
 * Credentials managed via IntegrationConfigService (admin panel)
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { DocusignController } from './docusign.controller';
import { DocusignService } from './docusign.service';
import { DocusignAuthService } from './docusign-auth.service';
import { ContractEnvelope, ContractEnvelopeSchema } from './contract-envelope.schema';
import { Contract, ContractSchema } from '../contracts/contract.schema';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ContractEnvelope.name, schema: ContractEnvelopeSchema },
      { name: 'Contract', schema: ContractSchema },
    ]),
    forwardRef(() => IntegrationConfigModule),
  ],
  controllers: [DocusignController],
  providers: [DocusignService, DocusignAuthService],
  exports: [DocusignService],
})
export class DocusignModule {}
