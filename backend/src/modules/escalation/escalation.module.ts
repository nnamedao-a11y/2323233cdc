import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { EscalationService } from './escalation.service';
import { EscalationHandler } from './escalation.handler';
import { EscalationCron } from './escalation.cron';
import { EscalationController } from './escalation.controller';
import { EscalationRun, EscalationRunSchema } from './schemas/escalation-run.schema';
import { EscalationRule, EscalationRuleSchema } from './schemas/escalation-rule.schema';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EscalationRun.name, schema: EscalationRunSchema },
      { name: EscalationRule.name, schema: EscalationRuleSchema },
    ]),
    ScheduleModule.forRoot(),
    EventBusModule,
  ],
  controllers: [EscalationController],
  providers: [
    EscalationService,
    EscalationHandler,
    EscalationCron,
  ],
  exports: [EscalationService],
})
export class EscalationModule {}
