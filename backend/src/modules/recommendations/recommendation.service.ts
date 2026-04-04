import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecommendationProfileService, UserProfile } from './recommendation-profile.service';

/**
 * Recommendation Type
 */
export enum RecommendationType {
  SIMILAR = 'similar',           // Similar to saved/viewed
  GOOD_DEAL = 'good_deal',       // Below avg price
  UPGRADE = 'upgrade',           // Higher tier
  YOU_MISSED = 'you_missed',     // Similar to saved but cheaper
  AUCTION_SOON = 'auction_soon', // Time-sensitive
}

/**
 * Recommendation Item
 */
export interface RecommendationItem {
  listing: any;
  score: number;
  type: RecommendationType;
  reason: string;
  priceTag?: 'good_deal' | 'upgrade' | 'normal';
}

/**
 * Recommendation Service
 * 
 * Core engine for generating personalized recommendations
 * Based on user profile + simple scoring (NO ML overkill!)
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly profileService: RecommendationProfileService,
    @InjectModel('VehicleListing') private listingModel: Model<any>,
    @InjectModel('CustomerSavedListing') private savedModel: Model<any>,
  ) {}

  /**
   * Get personalized recommendations for a customer
   */
  async getRecommendations(
    customerId: string, 
    limit: number = 5,
  ): Promise<RecommendationItem[]> {
    const profile = await this.profileService.buildProfile(customerId);
    
    if (!profile || profile.totalInteractions === 0) {
      // Fallback: Return popular listings
      return this.getPopularListings(limit);
    }

    // Get candidates
    const candidates = await this.getCandidates(profile);
    
    // Score and rank
    const scored = this.scoreListings(candidates, profile);
    
    // Filter out already saved
    const savedIds = await this.getSavedListingIds(customerId);
    const filtered = scored.filter(item => !savedIds.has(item.listing.id));

    return filtered.slice(0, limit);
  }

  /**
   * Get "You Missed This" recommendations
   * For users who saved but didn't buy
   */
  async getYouMissedRecommendations(
    customerId: string,
    limit: number = 3,
  ): Promise<RecommendationItem[]> {
    const profile = await this.profileService.buildProfile(customerId);
    if (!profile) return [];

    // Get saved listings
    const saved = await this.savedModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    if (saved.length === 0) return [];

    // Get saved listing details
    const savedIds = saved.map(s => s.listingId);
    const savedListings = await this.listingModel
      .find({ id: { $in: savedIds } })
      .lean();

    if (savedListings.length === 0) return [];

    // Find similar but cheaper alternatives
    const recommendations: RecommendationItem[] = [];
    
    for (const savedListing of savedListings) {
      if (!savedListing.make || !savedListing.currentBid) continue;

      const alternatives = await this.listingModel
        .find({
          isPublished: true,
          isDeleted: false,
          id: { $nin: savedIds },
          make: savedListing.make,
          $or: [
            { model: savedListing.model },
            { bodyType: savedListing.bodyType },
          ],
          currentBid: { 
            $lt: savedListing.currentBid,
            $gt: savedListing.currentBid * 0.5, // Not too cheap (suspicious)
          },
        })
        .sort({ currentBid: 1 })
        .limit(2)
        .lean();

      for (const alt of alternatives) {
        const savings = savedListing.currentBid - (alt.currentBid || 0);
        recommendations.push({
          listing: alt,
          score: 90 + (savings / savedListing.currentBid) * 10,
          type: RecommendationType.YOU_MISSED,
          reason: `Similar to ${savedListing.make} ${savedListing.model} you saved, but $${savings.toLocaleString()} cheaper!`,
          priceTag: 'good_deal',
        });
      }

      if (recommendations.length >= limit) break;
    }

    return recommendations.slice(0, limit);
  }

  /**
   * Get auction-soon recommendations
   * Time-sensitive opportunities
   */
  async getAuctionSoonRecommendations(
    customerId: string,
    hoursAhead: number = 24,
    limit: number = 3,
  ): Promise<RecommendationItem[]> {
    const profile = await this.profileService.buildProfile(customerId);
    if (!profile) return [];

    const now = new Date();
    const deadline = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const candidates = await this.listingModel
      .find({
        isPublished: true,
        isDeleted: false,
        auctionDate: { $gte: now, $lte: deadline },
        ...(profile.brands.length > 0 && { make: { $in: profile.brands } }),
        currentBid: { 
          $gte: profile.minPrice, 
          $lte: profile.maxPrice,
        },
      })
      .sort({ auctionDate: 1 })
      .limit(limit * 2)
      .lean();

    const savedIds = await this.getSavedListingIds(customerId);
    
    return candidates
      .filter(c => !savedIds.has(c.id))
      .slice(0, limit)
      .map(listing => {
        const hoursLeft = Math.round((new Date(listing.auctionDate).getTime() - now.getTime()) / (1000 * 60 * 60));
        return {
          listing,
          score: 100 - hoursLeft, // Closer = higher score
          type: RecommendationType.AUCTION_SOON,
          reason: `Auction in ${hoursLeft} hours - ${listing.make} ${listing.model}`,
          priceTag: 'normal',
        };
      });
  }

  /**
   * Get candidates based on profile
   */
  private async getCandidates(profile: UserProfile): Promise<any[]> {
    const query: any = {
      isPublished: true,
      isDeleted: false,
    };

    // Brand filter (if we have preferences)
    if (profile.brands.length > 0) {
      query.make = { $in: profile.brands };
    }

    // Price range
    query.$or = [
      { currentBid: { $gte: profile.minPrice, $lte: profile.maxPrice } },
      { buyNowPrice: { $gte: profile.minPrice, $lte: profile.maxPrice } },
    ];

    // Year range
    if (profile.years.min && profile.years.max) {
      query.year = { $gte: profile.years.min - 2, $lte: profile.years.max + 2 };
    }

    return this.listingModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  /**
   * Score listings based on profile match
   */
  private scoreListings(listings: any[], profile: UserProfile): RecommendationItem[] {
    return listings
      .map(listing => {
        let score = 0;
        let type = RecommendationType.SIMILAR;
        let priceTag: 'good_deal' | 'upgrade' | 'normal' = 'normal';
        const reasons: string[] = [];

        // Brand match (high weight)
        if (profile.brands.includes(listing.make)) {
          score += 30;
          reasons.push(`matches your interest in ${listing.make}`);
        }

        // Model match (highest weight)
        if (profile.models.includes(listing.model)) {
          score += 40;
        }

        // Body type match
        if (profile.bodyTypes.includes(listing.bodyType)) {
          score += 15;
        }

        // Price analysis
        const price = listing.currentBid || listing.buyNowPrice || 0;
        
        if (price < profile.avgPrice * 0.8) {
          // Good deal!
          score += 25;
          type = RecommendationType.GOOD_DEAL;
          priceTag = 'good_deal';
          const savings = Math.round(profile.avgPrice - price);
          reasons.push(`$${savings.toLocaleString()} below your usual range`);
        } else if (price > profile.avgPrice * 1.2) {
          // Upgrade opportunity
          score += 10;
          type = RecommendationType.UPGRADE;
          priceTag = 'upgrade';
          reasons.push('premium upgrade option');
        } else {
          score += 15; // In range
          reasons.push('matches your price range');
        }

        // Year freshness bonus
        const currentYear = new Date().getFullYear();
        if (listing.year && listing.year >= currentYear - 3) {
          score += 10;
        }

        // Has auction date (urgency bonus)
        if (listing.auctionDate) {
          const hoursToAuction = (new Date(listing.auctionDate).getTime() - Date.now()) / (1000 * 60 * 60);
          if (hoursToAuction > 0 && hoursToAuction < 48) {
            score += 20;
            type = RecommendationType.AUCTION_SOON;
            reasons.push(`auction in ${Math.round(hoursToAuction)} hours`);
          }
        }

        return {
          listing,
          score,
          type,
          reason: reasons.join(', ') || 'similar to your interests',
          priceTag,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get popular listings (fallback)
   */
  private async getPopularListings(limit: number): Promise<RecommendationItem[]> {
    const listings = await this.listingModel
      .find({
        isPublished: true,
        isDeleted: false,
      })
      .sort({ viewCount: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return listings.map(listing => ({
      listing,
      score: 50,
      type: RecommendationType.SIMILAR,
      reason: 'popular listing',
      priceTag: 'normal' as const,
    }));
  }

  /**
   * Get set of saved listing IDs
   */
  private async getSavedListingIds(customerId: string): Promise<Set<string>> {
    const saved = await this.savedModel
      .find({ customerId })
      .select('listingId')
      .lean();
    
    return new Set(saved.map(s => s.listingId));
  }
}
