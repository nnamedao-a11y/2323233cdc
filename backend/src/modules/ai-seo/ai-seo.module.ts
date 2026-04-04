import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeoCluster, SeoClusterSchema } from './schemas/seo-cluster.schema';
import { VehicleListing, VehicleListingSchema } from '../publishing/schemas/vehicle-listing.schema';
import { SeoClusterService } from './seo-cluster.service';
import { SeoClusterController } from './seo-cluster.controller';
import { AiSeoCron } from './ai-seo.cron';
import { AiModule } from '../ai/ai.module';

/**
 * AI SEO Module
 * 
 * Advanced AI-powered SEO features:
 * - SEO Clusters (brand, model, budget landing pages)
 * - Automatic AI enrichment cron
 * - Cluster rebuild cron
 */

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: SeoCluster.name, schema: SeoClusterSchema },
      { name: 'VehicleListing', schema: VehicleListingSchema },
    ]),
  ],
  providers: [SeoClusterService, AiSeoCron],
  controllers: [SeoClusterController],
  exports: [SeoClusterService],
})
export class AiSeoModule {}
