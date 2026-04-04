import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { AutomationProcessor } from './automation.processor';
import { AutomationRule, AutomationRuleSchema } from './schemas/automation-rule.schema';
import { AutomationLog, AutomationLogSchema } from './schemas/automation-log.schema';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeadRoutingModule } from '../lead-routing/lead-routing.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AutomationRule.name, schema: AutomationRuleSchema },
      { name: AutomationLog.name, schema: AutomationLogSchema },
    ]),
    BullModule.registerQueue({ name: 'automation' }),
    BullModule.registerQueue({ name: 'communications' }),
    forwardRef(() => TasksModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => LeadRoutingModule),
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationProcessor],
  exports: [AutomationService],
})
export class AutomationModule implements OnModuleInit {
  constructor(private automationService: AutomationService) {}

  async onModuleInit() {
    await this.automationService.bootstrapDefaultRules();
  }
}
