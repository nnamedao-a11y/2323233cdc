/**
 * BIBI Cars - Event Bus Module
 */

import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DiscoveryModule } from '@nestjs/core';
import { EventBusService } from './event-bus.service';
import { SystemEventDocument, SystemEventSchema } from './schemas/system-event.schema';

@Global()
@Module({
  imports: [
    DiscoveryModule,
    MongooseModule.forFeature([
      { name: SystemEventDocument.name, schema: SystemEventSchema },
    ]),
  ],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
