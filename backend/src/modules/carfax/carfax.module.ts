/**
 * Carfax Manual Flow Module
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CarfaxService } from './carfax.service';
import { CarfaxController } from './carfax.controller';
import { CarfaxRequest, CarfaxRequestSchema } from './carfax.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CarfaxRequest.name, schema: CarfaxRequestSchema },
    ]),
  ],
  controllers: [CarfaxController],
  providers: [CarfaxService],
  exports: [CarfaxService],
})
export class CarfaxModule {}
