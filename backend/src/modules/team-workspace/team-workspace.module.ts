/**
 * Team Workspace Module
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamWorkspaceController } from './team-workspace.controller';
import { TeamWorkspaceService } from './team-workspace.service';
import { UserSchema } from '../users/user.schema';
import { LeadSchema } from '../leads/lead.schema';
import { DealSchema } from '../deals/deal.schema';
import { TaskSchema } from '../tasks/task.schema';
import { InvoiceSchema } from '../payments/invoice.schema';
import { ShipmentSchema } from '../shipping/shipment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Task', schema: TaskSchema },
      { name: 'Invoice', schema: InvoiceSchema },
      { name: 'Shipment', schema: ShipmentSchema },
    ]),
  ],
  controllers: [TeamWorkspaceController],
  providers: [TeamWorkspaceService],
  exports: [TeamWorkspaceService],
})
export class TeamWorkspaceModule {}
