/**
 * BIBI Cars - Routing Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoutingService } from './routing.service';
import { RoutingController } from './routing.controller';
import { RoutingHandler } from './routing.handler';
import { RoutingCron } from './routing.cron';
import { LeadRoutingRule, LeadRoutingRuleSchema } from './schemas/lead-routing-rule.schema';
import { RoutingQueueEntry, RoutingQueueEntrySchema } from './schemas/routing-queue-entry.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeadRoutingRule.name, schema: LeadRoutingRuleSchema },
      { name: RoutingQueueEntry.name, schema: RoutingQueueEntrySchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'User', schema: UserSchema },
    ]),
  ],
  controllers: [RoutingController],
  providers: [RoutingService, RoutingHandler, RoutingCron],
  exports: [RoutingService],
})
export class RoutingModule {}
