import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallFlowController } from './call-flow.controller';
import { CallFlowManagementService } from './call-flow-management.service';
import { CallFlowService } from './services/call-flow.service';
import { CallSession, CallSessionSchema } from './call-session.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallSession.name, schema: CallSessionSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
  ],
  controllers: [CallFlowController],
  providers: [
    CallFlowManagementService,
    CallFlowService,
  ],
  exports: [CallFlowManagementService],
})
export class CallFlowModule {}
