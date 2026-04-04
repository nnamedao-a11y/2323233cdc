import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PublishingService } from './publishing.service';
import { PublishingController } from './publishing.controller';
import { VehicleListing, VehicleListingSchema } from './schemas/vehicle-listing.schema';

/**
 * Publishing Module
 * 
 * Vehicle listing moderation and publishing pipeline
 * 
 * Pipeline: parsed → normalized → pending_review → approved → published → archived
 */

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VehicleListing.name, schema: VehicleListingSchema },
    ]),
  ],
  controllers: [PublishingController],
  providers: [PublishingService],
  exports: [PublishingService],
})
export class PublishingModule {}
