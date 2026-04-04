import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BootstrapService } from './bootstrap.service';
import { SeedService } from './seed.service';
import { SystemController } from './system.controller';
import { User, UserSchema } from '../modules/users/user.schema';
import { Lead, LeadSchema } from '../modules/leads/lead.schema';
import { Customer, CustomerSchema } from '../modules/customers/customer.schema';
import { AutomationRule, AutomationRuleSchema } from '../modules/automation/schemas/automation-rule.schema';
import { MessageTemplate, MessageTemplateSchema } from '../modules/communications/schemas/message-template.schema';
import { Setting, SettingSchema } from '../modules/settings/setting.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: AutomationRule.name, schema: AutomationRuleSchema },
      { name: MessageTemplate.name, schema: MessageTemplateSchema },
      { name: Setting.name, schema: SettingSchema },
    ]),
  ],
  controllers: [SystemController],
  providers: [BootstrapService, SeedService],
  exports: [BootstrapService, SeedService],
})
export class BootstrapModule {}
