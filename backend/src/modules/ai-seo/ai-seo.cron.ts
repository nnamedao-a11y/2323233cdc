import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiEnrichmentService } from '../ai/ai-enrichment.service';
import { SeoClusterService } from './seo-cluster.service';
import { VehicleListing, VehicleListingDocument, ListingStatus } from '../publishing/schemas/vehicle-listing.schema';

@Injectable()
export class AiSeoCron {
  private readonly logger = new Logger(AiSeoCron.name);

  constructor(
    @InjectModel('VehicleListing')
    private readonly listingModel: Model<VehicleListingDocument>,
    private readonly aiEnrichment: AiEnrichmentService,
    private readonly clusterService: SeoClusterService,
  ) {}

  /**
   * Enrich published listings every 2 hours
   */
  @Cron('0 */2 * * *')
  async enrichPublishedListings() {
    this.logger.log('Running AI enrichment cron job...');
    
    try {
      const count = await this.aiEnrichment.enrichPublishedListings(20);
      this.logger.log(`Enriched ${count} listings`);
    } catch (error) {
      this.logger.error(`AI enrichment failed: ${error.message}`);
    }
  }

  /**
   * Rebuild SEO clusters every 2 hours (offset by 30 min)
   */
  @Cron('30 */2 * * *')
  async rebuildSeoClusters() {
    this.logger.log('Running SEO cluster rebuild cron job...');
    
    try {
      const result = await this.clusterService.rebuildClusters();
      this.logger.log(`Clusters rebuilt: ${result.created} created, ${result.updated} updated`);
    } catch (error) {
      this.logger.error(`Cluster rebuild failed: ${error.message}`);
    }
  }
}
