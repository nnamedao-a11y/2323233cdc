/**
 * Reminder Workflow Module
 * 
 * Features:
 * - Cron-based reminders (auction soon, price changed, idle user)
 * - Intent scoring (HOT/WARM/COLD)
 * - AUTO-LEAD creation for HOT users
 * - Notification logging
 * 
 * API:
 * - POST /api/reminders/trigger/auction-soon
 * - POST /api/reminders/trigger/price-changed
 * - GET  /api/admin/reminders/logs
 * - GET  /api/admin/reminders/analytics
 * - GET  /api/admin/intent/hot-leads
 * - GET  /api/admin/intent/scores
 * - GET  /api/admin/intent/analytics
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserNotificationLog, UserNotificationLogSchema } from './schemas/user-notification-log.schema';
import { IntentScore, IntentScoreSchema } from './schemas/intent-score.schema';
import { Favorite, FavoriteSchema } from '../user-engagement/favorites/schemas/favorite.schema';
import { ReminderWorkflowService } from './reminder-workflow.service';
import { IntentScoringService } from './intent-scoring.service';
import { LeadsModule } from '../leads/leads.module';
import { TasksModule } from '../tasks/tasks.module';
import { AutoCallModule } from '../auto-call/auto-call.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { 
  ReminderWorkflowController, 
  ReminderAdminController,
  IntentController,
  IntentAdminController,
} from './reminder-workflow.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserNotificationLog.name, schema: UserNotificationLogSchema },
      { name: IntentScore.name, schema: IntentScoreSchema },
      { name: Favorite.name, schema: FavoriteSchema },
    ]),
    forwardRef(() => LeadsModule),
    forwardRef(() => TasksModule),
    forwardRef(() => AutoCallModule),
    forwardRef(() => TelegramBotModule),
  ],
  controllers: [
    ReminderWorkflowController,
    ReminderAdminController,
    IntentController,
    IntentAdminController,
  ],
  providers: [
    ReminderWorkflowService,
    IntentScoringService,
  ],
  exports: [
    ReminderWorkflowService,
    IntentScoringService,
  ],
})
export class ReminderWorkflowModule {}
