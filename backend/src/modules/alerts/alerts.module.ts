/**
 * Alerts Module
 * 
 * Central notification system for BIBI Cars CRM
 * Includes Critical Alert Service for owner notifications
 * Includes Event Handler for Zoho-style event-driven alerts
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { CriticalAlertService } from './critical-alert.service';
import { AlertRetryCron } from './alert-retry.cron';
import { AlertEventHandler } from './alert-event.handler';
import { AlertEvent, AlertEventSchema } from './alert-event.schema';
import { AlertSettings, AlertSettingsSchema } from './alert-settings.schema';
import { AlertLog, AlertLogSchema } from './alert-log.schema';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AlertEvent.name, schema: AlertEventSchema },
      { name: AlertSettings.name, schema: AlertSettingsSchema },
      { name: 'AlertLog', schema: AlertLogSchema },
      { name: 'User', schema: UserSchema },
    ]),
    TelegramBotModule,
    forwardRef(() => IntegrationConfigModule),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, CriticalAlertService, AlertRetryCron, AlertEventHandler],
  exports: [AlertsService, CriticalAlertService],
})
export class AlertsModule {}
