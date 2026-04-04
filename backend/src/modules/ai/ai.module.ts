import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VehicleListing, VehicleListingSchema } from '../publishing/schemas/vehicle-listing.schema';
import { AiEnrichmentService } from './ai-enrichment.service';
import { AiController } from './ai.controller';
import { OpenAIService } from './openai.service';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VehicleListing.name, schema: VehicleListingSchema },
    ]),
    forwardRef(() => IntegrationConfigModule),
  ],
  providers: [AiEnrichmentService, OpenAIService],
  controllers: [AiController],
  exports: [AiEnrichmentService, OpenAIService],
})
export class AiModule {}
