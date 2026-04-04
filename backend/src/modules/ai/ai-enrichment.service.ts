import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VehicleListing, VehicleListingDocument, ListingStatus } from '../publishing/schemas/vehicle-listing.schema';
import axios from 'axios';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8003';

interface AiEnrichmentResult {
  aiDescription: string;
  aiShortSummary: string;
  managerHint: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  faq: string[];
}

@Injectable()
export class AiEnrichmentService {
  private readonly logger = new Logger(AiEnrichmentService.name);

  constructor(
    @InjectModel(VehicleListing.name)
    private readonly listingModel: Model<VehicleListingDocument>,
  ) {}

  /**
   * Enrich a single listing with AI-generated content
   */
  async enrichListing(listingId: string): Promise<VehicleListingDocument | null> {
    const listing = await this.listingModel.findOne({ id: listingId });
    if (!listing) {
      this.logger.warn(`Listing not found: ${listingId}`);
      return null;
    }

    try {
      const enrichment = await this.callAiService(listing);
      
      listing.aiDescription = enrichment.aiDescription;
      listing.aiShortSummary = enrichment.aiShortSummary;
      listing.managerHint = enrichment.managerHint;
      listing.metaTitle = enrichment.seoTitle;
      listing.metaDescription = enrichment.seoDescription;
      listing.keywords = enrichment.seoKeywords;
      listing.aiFaq = enrichment.faq;
      listing.isAiEnriched = true;
      listing.aiEnrichedAt = new Date();

      await listing.save();
      this.logger.log(`Enriched listing: ${listingId}`);
      
      return listing;
    } catch (error) {
      this.logger.error(`Failed to enrich listing ${listingId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Enrich all published listings that haven't been enriched yet
   */
  async enrichPublishedListings(limit = 10): Promise<number> {
    const listings = await this.listingModel.find({
      isPublished: true,
      status: ListingStatus.PUBLISHED,
      $or: [
        { isAiEnriched: false },
        { isAiEnriched: { $exists: false } },
        { aiDescription: { $exists: false } },
        { aiDescription: '' },
      ],
    }).limit(limit);

    let enrichedCount = 0;
    
    for (const listing of listings) {
      const result = await this.enrichListing(listing.id);
      if (result) enrichedCount++;
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.logger.log(`Enriched ${enrichedCount} listings`);
    return enrichedCount;
  }

  /**
   * Call the AI microservice
   */
  private async callAiService(listing: VehicleListingDocument): Promise<AiEnrichmentResult> {
    const listingData = listing as any;
    const payload = {
      vin: listing.vin,
      make: listing.make,
      model: listing.model,
      year: listing.year,
      price: listing.currentBid || listing.buyNowPrice || listing.estimatedRetail,
      currentBid: listing.currentBid,
      location: listing.auctionLocation || listingData.location,
      mileage: listing.mileage,
      bodyType: listing.bodyType,
      fuelType: listing.fuelType,
      transmission: listing.transmission,
      damageType: listing.damageType || listing.primaryDamage,
      isAuction: !!listing.auctionDate,
      auctionSource: listing.source,
    };

    const response = await axios.post(`${AI_SERVICE_URL}/enrich`, payload, {
      timeout: 30000,
    });

    return response.data;
  }

  /**
   * Check if AI service is available
   */
  async isServiceHealthy(): Promise<boolean> {
    try {
      const response = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
      return response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }
}
