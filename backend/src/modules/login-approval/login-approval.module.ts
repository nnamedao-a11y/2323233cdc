/**
 * Login Approval Module
 * 
 * Team Lead login approval flow
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoginApprovalController } from './login-approval.controller';
import { LoginApprovalService } from './login-approval.service';
import { LoginApprovalRequest, LoginApprovalRequestSchema } from './login-request.schema';
import { User, UserSchema } from '../users/user.schema';
import { AlertSettings, AlertSettingsSchema } from '../alerts/alert-settings.schema';
import { AlertsModule } from '../alerts/alerts.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoginApprovalRequest.name, schema: LoginApprovalRequestSchema },
      { name: 'User', schema: UserSchema },
      { name: 'AlertSettings', schema: AlertSettingsSchema },
    ]),
    AlertsModule,
    TelegramBotModule,
  ],
  controllers: [LoginApprovalController],
  providers: [LoginApprovalService],
  exports: [LoginApprovalService],
})
export class LoginApprovalModule {}
