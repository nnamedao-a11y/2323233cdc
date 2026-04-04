/**
 * Viber Bot Module
 * 
 * Simple messaging channel for notifications relay
 * Not complex like Telegram - focused on mass reach
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ViberService } from './viber.service';
import { ViberController } from './viber.controller';
import { ViberLinkService } from './viber-link.service';
import { ViberRouterService } from './viber-router.service';

import { Customer, CustomerSchema } from '../customers/customer.schema';
import { CustomerCabinetModule } from '../customer-cabinet/customer-cabinet.module';

@Module({
  imports: [
    CustomerCabinetModule,
    MongooseModule.forFeature([
      { name: 'Customer', schema: CustomerSchema },
    ]),
  ],
  controllers: [ViberController],
  providers: [
    ViberService,
    ViberLinkService,
    ViberRouterService,
  ],
  exports: [ViberService, ViberLinkService],
})
export class ViberBotModule {}
