import { Controller, Get, Query, UseGuards, Req, Logger } from '@nestjs/common';
import { RecommendationService, RecommendationType } from './recommendation.service';
import { RecommendationProfileService } from './recommendation-profile.service';

/**
 * Recommendation API Controller
 * 
 * Public endpoints for getting personalized recommendations
 */
@Controller('recommendations')
export class RecommendationController {
  private readonly logger = new Logger(RecommendationController.name);

  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly profileService: RecommendationProfileService,
  ) {}

  /**
   * Get recommendations for a customer
   * GET /api/recommendations?customerId=xxx&limit=5
   */
  @Get()
  async getRecommendations(
    @Query('customerId') customerId: string,
    @Query('limit') limit?: string,
  ) {
    if (!customerId) {
      return { 
        success: false, 
        error: 'customerId is required',
        data: [],
      };
    }

    const recommendations = await this.recommendationService.getRecommendations(
      customerId,
      limit ? parseInt(limit, 10) : 5,
    );

    return {
      success: true,
      data: recommendations.map(rec => ({
        id: rec.listing.id,
        vin: rec.listing.vin,
        make: rec.listing.make,
        model: rec.listing.model,
        year: rec.listing.year,
        price: rec.listing.currentBid || rec.listing.buyNowPrice,
        image: rec.listing.primaryImage || rec.listing.images?.[0],
        slug: rec.listing.slug,
        score: rec.score,
        type: rec.type,
        reason: rec.reason,
        priceTag: rec.priceTag,
        auctionDate: rec.listing.auctionDate,
      })),
      meta: {
        total: recommendations.length,
        customerId,
      },
    };
  }

  /**
   * Get "You Missed This" recommendations
   * GET /api/recommendations/missed?customerId=xxx
   */
  @Get('missed')
  async getMissedRecommendations(
    @Query('customerId') customerId: string,
    @Query('limit') limit?: string,
  ) {
    if (!customerId) {
      return { 
        success: false, 
        error: 'customerId is required',
        data: [],
      };
    }

    const recommendations = await this.recommendationService.getYouMissedRecommendations(
      customerId,
      limit ? parseInt(limit, 10) : 3,
    );

    return {
      success: true,
      data: recommendations.map(rec => ({
        id: rec.listing.id,
        vin: rec.listing.vin,
        make: rec.listing.make,
        model: rec.listing.model,
        year: rec.listing.year,
        price: rec.listing.currentBid || rec.listing.buyNowPrice,
        image: rec.listing.primaryImage || rec.listing.images?.[0],
        slug: rec.listing.slug,
        score: rec.score,
        type: RecommendationType.YOU_MISSED,
        reason: rec.reason,
        priceTag: 'good_deal',
      })),
      meta: {
        total: recommendations.length,
        customerId,
      },
    };
  }

  /**
   * Get auction-soon recommendations  
   * GET /api/recommendations/auction-soon?customerId=xxx&hours=24
   */
  @Get('auction-soon')
  async getAuctionSoonRecommendations(
    @Query('customerId') customerId: string,
    @Query('hours') hours?: string,
    @Query('limit') limit?: string,
  ) {
    if (!customerId) {
      return { 
        success: false, 
        error: 'customerId is required',
        data: [],
      };
    }

    const recommendations = await this.recommendationService.getAuctionSoonRecommendations(
      customerId,
      hours ? parseInt(hours, 10) : 24,
      limit ? parseInt(limit, 10) : 3,
    );

    return {
      success: true,
      data: recommendations.map(rec => ({
        id: rec.listing.id,
        vin: rec.listing.vin,
        make: rec.listing.make,
        model: rec.listing.model,
        year: rec.listing.year,
        price: rec.listing.currentBid || rec.listing.buyNowPrice,
        image: rec.listing.primaryImage || rec.listing.images?.[0],
        slug: rec.listing.slug,
        auctionDate: rec.listing.auctionDate,
        score: rec.score,
        type: RecommendationType.AUCTION_SOON,
        reason: rec.reason,
      })),
      meta: {
        total: recommendations.length,
        customerId,
        hoursAhead: hours ? parseInt(hours, 10) : 24,
      },
    };
  }

  /**
   * Get user preference profile (for debugging/admin)
   * GET /api/recommendations/profile?customerId=xxx
   */
  @Get('profile')
  async getUserProfile(@Query('customerId') customerId: string) {
    if (!customerId) {
      return { 
        success: false, 
        error: 'customerId is required',
      };
    }

    const profile = await this.profileService.buildProfile(customerId);

    if (!profile) {
      return {
        success: true,
        data: null,
        message: 'No activity data available for this customer',
      };
    }

    return {
      success: true,
      data: {
        customerId: profile.customerId,
        preferredBrands: profile.brands,
        preferredModels: profile.models,
        priceRange: {
          average: profile.avgPrice,
          min: profile.minPrice,
          max: profile.maxPrice,
        },
        preferredBodyTypes: profile.bodyTypes,
        yearRange: profile.years,
        totalInteractions: profile.totalInteractions,
        lastActivityAt: profile.lastActivityAt,
      },
    };
  }

  /**
   * Health check
   * GET /api/recommendations/status
   */
  @Get('status')
  async getStatus() {
    return {
      ok: true,
      service: 'recommendations',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      features: [
        'personalized_recommendations',
        'you_missed_this',
        'auction_soon_alerts',
        'user_profiling',
      ],
    };
  }
}
