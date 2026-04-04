import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * User Preference Profile
 * Extracted from saved/viewed/quotes behavior
 */
export interface UserProfile {
  customerId: string;
  brands: string[];
  models: string[];
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  bodyTypes: string[];
  years: { min: number; max: number };
  preferredDamageTypes: string[];
  lastActivityAt: Date;
  totalInteractions: number;
}

/**
 * Recommendation Profile Service
 * 
 * Builds user preference profile from:
 * - Saved listings
 * - Recently viewed
 * - VIN searches
 * - Quotes (price intent!)
 * - Deals history
 */
@Injectable()
export class RecommendationProfileService {
  private readonly logger = new Logger(RecommendationProfileService.name);

  constructor(
    @InjectModel('CustomerSavedListing') private savedModel: Model<any>,
    @InjectModel('CustomerRecentlyViewed') private viewedModel: Model<any>,
    @InjectModel('Quote') private quoteModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('VehicleListing') private listingModel: Model<any>,
  ) {}

  /**
   * Build comprehensive user profile
   */
  async buildProfile(customerId: string): Promise<UserProfile | null> {
    try {
      // Fetch all user activity
      const [saved, viewed, quotes, deals] = await Promise.all([
        this.getSavedListings(customerId),
        this.getViewedListings(customerId),
        this.getQuotes(customerId),
        this.getDeals(customerId),
      ]);

      // Combine all listings data
      const allListings = [...saved, ...viewed];
      
      if (allListings.length === 0 && quotes.length === 0) {
        return null; // No data to build profile
      }

      // Extract preferences
      const brands = this.extractTop(allListings.map(l => l.make).filter(Boolean), 5);
      const models = this.extractTop(allListings.map(l => l.model).filter(Boolean), 5);
      const bodyTypes = this.extractTop(allListings.map(l => l.bodyType).filter(Boolean), 3);
      const damageTypes = this.extractTop(allListings.map(l => l.damageType).filter(Boolean), 3);

      // Price analysis (quotes are strongest signal)
      const quotePrices = quotes.map(q => q.vehiclePrice || q.totalPrice).filter(Boolean);
      const listingPrices = allListings.map(l => l.currentBid || l.buyNowPrice).filter(Boolean);
      const dealPrices = deals.map(d => d.clientPrice).filter(Boolean);
      const allPrices = [...quotePrices, ...listingPrices, ...dealPrices];

      const avgPrice = allPrices.length > 0 
        ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length)
        : 25000; // Default

      // Year preferences
      const years = allListings.map(l => l.year).filter(Boolean);
      const yearRange = years.length > 0
        ? { min: Math.min(...years), max: Math.max(...years) }
        : { min: 2015, max: new Date().getFullYear() };

      // Last activity
      const activities = [
        ...saved.map(s => s.createdAt),
        ...viewed.map(v => v.viewedAt || v.createdAt),
        ...quotes.map(q => q.createdAt),
      ].filter(Boolean);
      
      const lastActivityAt = activities.length > 0
        ? new Date(Math.max(...activities.map(d => new Date(d).getTime())))
        : new Date();

      return {
        customerId,
        brands,
        models,
        avgPrice,
        minPrice: Math.round(avgPrice * 0.6),
        maxPrice: Math.round(avgPrice * 1.5),
        bodyTypes,
        years: yearRange,
        preferredDamageTypes: damageTypes,
        lastActivityAt,
        totalInteractions: allListings.length + quotes.length,
      };
    } catch (error) {
      this.logger.error(`Error building profile for ${customerId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get saved listings with full vehicle data
   */
  private async getSavedListings(customerId: string): Promise<any[]> {
    const saved = await this.savedModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    if (saved.length === 0) return [];

    const listingIds = saved.map(s => s.listingId);
    const listings = await this.listingModel
      .find({ id: { $in: listingIds } })
      .lean();

    const listingMap = new Map(listings.map(l => [l.id, l]));
    
    return saved
      .map(s => ({ ...s, ...listingMap.get(s.listingId) }))
      .filter(s => s.make); // Only with valid data
  }

  /**
   * Get recently viewed with full vehicle data
   */
  private async getViewedListings(customerId: string): Promise<any[]> {
    const viewed = await this.viewedModel
      .find({ customerId })
      .sort({ viewedAt: -1 })
      .limit(100)
      .lean();

    if (viewed.length === 0) return [];

    const listingIds = viewed.map(v => v.listingId);
    const listings = await this.listingModel
      .find({ id: { $in: listingIds } })
      .lean();

    const listingMap = new Map(listings.map(l => [l.id, l]));
    
    return viewed
      .map(v => ({ ...v, ...listingMap.get(v.listingId) }))
      .filter(v => v.make);
  }

  /**
   * Get customer quotes
   */
  private async getQuotes(customerId: string): Promise<any[]> {
    return this.quoteModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
  }

  /**
   * Get customer deals
   */
  private async getDeals(customerId: string): Promise<any[]> {
    return this.dealModel
      .find({ customerId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  }

  /**
   * Extract top N items from array
   */
  private extractTop(items: string[], limit: number): string[] {
    const counts = new Map<string, number>();
    
    items.forEach(item => {
      if (item) {
        counts.set(item, (counts.get(item) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
  }

  /**
   * Check if user is active (had activity in last N days)
   */
  async isUserActive(customerId: string, days: number = 30): Promise<boolean> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);

    const [savedCount, viewedCount, quoteCount] = await Promise.all([
      this.savedModel.countDocuments({
        customerId,
        createdAt: { $gte: threshold },
      }),
      this.viewedModel.countDocuments({
        customerId,
        $or: [
          { viewedAt: { $gte: threshold } },
          { createdAt: { $gte: threshold } },
        ],
      }),
      this.quoteModel.countDocuments({
        customerId,
        createdAt: { $gte: threshold },
      }),
    ]);

    return (savedCount + viewedCount + quoteCount) > 0;
  }
}
