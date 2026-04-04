import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { ParserRawData, ParserRawDataSchema } from './schemas/parser-raw-data.schema';
import { Vehicle, VehicleSchema } from './schemas/vehicle.schema';

// Services
import { IngestionService } from './services/ingestion.service';
import { VehicleService } from './services/vehicle.service';

// Controllers
import { IngestionController } from './controllers/ingestion.controller';
import { ProxyAdminController } from './antiblock/proxy-admin.controller';
import { VehiclesController } from './controllers/vehicles.controller';
import { PublicVehiclesController } from './controllers/public-vehicles.controller';

// Lead model for vehicles controller
import { Lead, LeadSchema } from '../leads/lead.schema';

// Antiblock Services
import {
  HttpFingerprintService,
  ProxyPoolService,
  EnhancedProxyPoolService,
  CircuitBreakerService,
  ParserHealthService,
  ParserGuardService,
  ResilientFetchService,
} from './antiblock';

// Runners
import { CopartRunner } from './runners/copart.runner';
import { IAAIRunner } from './runners/iaai.runner';

/**
 * Ingestion Module
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParserRawData.name, schema: ParserRawDataSchema },
      { name: Vehicle.name, schema: VehicleSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
  ],
  controllers: [IngestionController, ProxyAdminController, VehiclesController, PublicVehiclesController],
  providers: [
    // Core services
    IngestionService,
    VehicleService,
    
    // Antiblock services
    HttpFingerprintService,
    ProxyPoolService,
    EnhancedProxyPoolService,
    CircuitBreakerService,
    ParserHealthService,
    ParserGuardService,
    ResilientFetchService,
    
    // Runners
    CopartRunner,
    IAAIRunner,
  ],
  exports: [
    IngestionService, 
    VehicleService,
    CopartRunner,
    IAAIRunner,
    ParserHealthService,
    CircuitBreakerService,
    EnhancedProxyPoolService,
  ],
})
export class IngestionModule {}
