import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { RoutingRule, RoutingRuleSchema } from './schemas/routing-rule.schema';
import { AssignmentHistory, AssignmentHistorySchema } from './schemas/assignment-history.schema';

// Services
import { LeadRoutingService } from './services/lead-routing.service';
import { LeadRoutingStrategyService } from './services/lead-routing-strategy.service';
import { ManagerAvailabilityService } from './services/manager-availability.service';
import { RoutingRulesService } from './services/routing-rules.service';

// Controller
import { LeadRoutingController } from './controllers/lead-routing.controller';

// External modules
import { LeadsModule } from '../leads/leads.module';
import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

// External schemas (for availability service)
import { User, UserSchema } from '../users/user.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RoutingRule.name, schema: RoutingRuleSchema },
      { name: AssignmentHistory.name, schema: AssignmentHistorySchema },
      { name: User.name, schema: UserSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
    forwardRef(() => LeadsModule),
    UsersModule,
    forwardRef(() => TasksModule),
    NotificationsModule,
    AuditLogModule,
  ],
  controllers: [LeadRoutingController],
  providers: [
    LeadRoutingService,
    LeadRoutingStrategyService,
    ManagerAvailabilityService,
    RoutingRulesService,
  ],
  exports: [
    LeadRoutingService,
    RoutingRulesService,
    ManagerAvailabilityService,
  ],
})
export class LeadRoutingModule implements OnModuleInit {
  constructor(private rulesService: RoutingRulesService) {}

  async onModuleInit() {
    // Bootstrap default routing rules
    await this.rulesService.bootstrapDefaultRules('system');
  }
}
