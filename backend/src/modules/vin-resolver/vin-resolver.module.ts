/**
 * VIN Resolver Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VinResolverService } from './vin-resolver.service';
import { VinResolverController } from './vin-resolver.controller';
import { Vehicle, VehicleSchema } from '../ingestion/schemas/vehicle.schema';
import { VinEngineModule } from '../vin-engine/vin-engine.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vehicle.name, schema: VehicleSchema },
    ]),
    forwardRef(() => VinEngineModule),
  ],
  controllers: [VinResolverController],
  providers: [VinResolverService],
  exports: [VinResolverService],
})
export class VinResolverModule {}
