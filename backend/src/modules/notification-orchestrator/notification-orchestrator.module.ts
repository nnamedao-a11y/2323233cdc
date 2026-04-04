/**
 * Notification Orchestrator Module
 * 
 * Multi-channel notification delivery system:
 * - Priority-based routing
 * - Double-send for high priority
 * - Delivery tracking
 * - Fallback logic
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationDelivery, NotificationDeliverySchema } from './notification-delivery.schema';

import { Customer, CustomerSchema } from '../customers/customer.schema';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { ViberBotModule } from '../viber-bot/viber.module';

@Module({
  imports: [
    TelegramBotModule,
    ViberBotModule,
    MongooseModule.forFeature([
      { name: 'Customer', schema: CustomerSchema },
      { name: 'NotificationDelivery', schema: NotificationDeliverySchema },
    ]),
  ],
  providers: [NotificationOrchestratorService],
  exports: [NotificationOrchestratorService],
})
export class NotificationOrchestratorModule {}
