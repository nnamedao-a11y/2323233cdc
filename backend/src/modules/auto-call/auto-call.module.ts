/**
 * Auto-Call Module
 * 
 * Модуль автоматичних дзвінків менеджерам при HOT intent
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AutoCallService } from './auto-call.service';
import { AutoCallController } from './auto-call.controller';
import { AutoCallConfig, AutoCallConfigSchema } from './schemas/auto-call-config.schema';
import { AutoCallLog, AutoCallLogSchema } from './schemas/auto-call-log.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AutoCallConfig.name, schema: AutoCallConfigSchema },
      { name: AutoCallLog.name, schema: AutoCallLogSchema },
    ]),
  ],
  controllers: [AutoCallController],
  providers: [AutoCallService],
  exports: [AutoCallService],
})
export class AutoCallModule {}
