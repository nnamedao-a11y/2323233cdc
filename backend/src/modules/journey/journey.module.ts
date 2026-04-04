/**
 * BIBI Cars - Journey Module (Updated)
 * With persistent storage, controller, and analytics
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JourneyService } from './journey.service';
import { JourneyController } from './journey.controller';
import { JourneyHandler } from './journey.handler';
import { JourneyEvent, JourneyEventSchema } from './schemas/journey-event.schema';
import { JourneySnapshot, JourneySnapshotSchema } from './schemas/journey-snapshot.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JourneyEvent.name, schema: JourneyEventSchema },
      { name: JourneySnapshot.name, schema: JourneySnapshotSchema },
    ]),
  ],
  providers: [JourneyService, JourneyHandler],
  controllers: [JourneyController],
  exports: [JourneyService],
})
export class JourneyModule {}
