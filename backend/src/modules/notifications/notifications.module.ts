import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Services
import { NotificationsService } from './notifications.service';
import { SmartNotificationService } from './smart-notification.service';
import { SmartIntentService } from './smart-intent.service';
import { TelegramService } from './telegram.service';
import { CooldownService } from './cooldown.service';
import { NotificationCron } from './notification.cron';
import { NotificationsGateway } from './notifications.gateway';
import { CustomerNotificationService } from './customer-notification.service';
import { NotificationService } from './notification.service';
import { TelegramNotificationService } from './telegram-notification.service';
import { NotificationEventHandler } from './notification-event.handler';

// Controllers
import { NotificationsController } from './notifications.controller';
import { NotificationController } from './notification.controller';
import { TelegramLinkController } from './telegram-link.controller';

// Schemas
import { AdminNotification, AdminNotificationSchema } from './notification.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { TelegramLink, TelegramLinkSchema } from './schemas/telegram-link.schema';
import { NotificationRule, NotificationRuleSchema } from './schemas/notification-rule.schema';
import { NotificationDeliveryLog, NotificationDeliveryLogSchema } from './schemas/notification-delivery-log.schema';
import { SoundConfig, SoundConfigSchema } from './schemas/sound-config.schema';

// External schemas for intent scoring
import { CustomerSavedListing, CustomerSavedListingSchema } from '../customer-auth/schemas/customer-saved-listing.schema';
import { CustomerRecentlyViewed, CustomerRecentlyViewedSchema } from '../customer-auth/schemas/customer-recently-viewed.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Vehicle, VehicleSchema } from '../ingestion/schemas/vehicle.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';

// External modules
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      // Notification schemas
      { name: AdminNotification.name, schema: AdminNotificationSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: TelegramLink.name, schema: TelegramLinkSchema },
      { name: NotificationRule.name, schema: NotificationRuleSchema },
      { name: NotificationDeliveryLog.name, schema: NotificationDeliveryLogSchema },
      { name: SoundConfig.name, schema: SoundConfigSchema },
      
      // External schemas for intent scoring and cron jobs
      { name: 'CustomerSavedListing', schema: CustomerSavedListingSchema },
      { name: 'CustomerRecentlyViewed', schema: CustomerRecentlyViewedSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'VehicleListing', schema: VehicleSchema },
      { name: 'Deal', schema: DealSchema },
      { name: 'Customer', schema: CustomerSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'bibi-crm-secret',
        signOptions: { expiresIn: '24h' },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => TelegramBotModule),
  ],
  controllers: [NotificationsController, NotificationController, TelegramLinkController],
  providers: [
    NotificationsService,
    SmartNotificationService,
    SmartIntentService,
    TelegramService,
    CooldownService,
    NotificationCron,
    NotificationsGateway,
    CustomerNotificationService,
    NotificationService,
    TelegramNotificationService,
    NotificationEventHandler,
  ],
  exports: [
    NotificationsService,
    SmartNotificationService,
    TelegramService,
    CooldownService,
    NotificationsGateway,
    CustomerNotificationService,
    NotificationService,
    TelegramNotificationService,
  ],
})
export class NotificationsModule {}
