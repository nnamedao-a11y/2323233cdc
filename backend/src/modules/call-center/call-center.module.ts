import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { CallCenterService } from './call-center.service';
import { CallCenterController } from './call-center.controller';
import { CallbackProcessor } from './callback.processor';
import { SlaBbreachService } from './services/sla-breach.service';
import { SlaController } from './controllers/sla.controller';
import { CallLog, CallLogSchema } from './schemas/call-log.schema';
import { CallbackQueue, CallbackQueueSchema } from './schemas/callback-queue.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { User, UserSchema } from '../users/user.schema';
import { AutomationModule } from '../automation/automation.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallLog.name, schema: CallLogSchema },
      { name: CallbackQueue.name, schema: CallbackQueueSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Task.name, schema: TaskSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: 'callbacks' }),
    forwardRef(() => AutomationModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [CallCenterController, SlaController],
  providers: [CallCenterService, CallbackProcessor, SlaBbreachService],
  exports: [CallCenterService, SlaBbreachService],
})
export class CallCenterModule {}
