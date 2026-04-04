import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { ViberBotModule } from '../viber-bot/viber.module';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => ViberBotModule),
    forwardRef(() => IntegrationConfigModule),
    MongooseModule.forFeature([
      { name: 'Customer', schema: CustomerSchema },
      { name: 'Notification', schema: NotificationSchema },
    ]),
  ],
  providers: [NotificationDispatcherService],
  exports: [NotificationDispatcherService],
})
export class NotificationDispatcherModule {}
