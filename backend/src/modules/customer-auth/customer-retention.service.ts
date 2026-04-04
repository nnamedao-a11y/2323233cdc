import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface SaveListingPayload {
  listingId: string;
  vin?: string;
  slug?: string;
}

@Injectable()
export class CustomerRetentionService {
  private readonly logger = new Logger(CustomerRetentionService.name);

  constructor(
    @InjectModel('CustomerSavedListing')
    private readonly savedModel: Model<any>,
    @InjectModel('CustomerRecentlyViewed')
    private readonly viewedModel: Model<any>,
    @InjectModel('VehicleListing')
    private readonly listingModel: Model<any>,
  ) {}

  // ============ SAVED LISTINGS ============
  async saveListing(customerId: string, payload: SaveListingPayload) {
    const existing = await this.savedModel.findOne({
      customerId,
      listingId: payload.listingId,
    });

    if (existing) {
      return existing;
    }

    return this.savedModel.create({
      id: uuidv4(),
      customerId,
      listingId: payload.listingId,
      vin: payload.vin || '',
      slug: payload.slug || '',
      createdAt: new Date(),
    });
  }

  async unsaveListing(customerId: string, listingId: string) {
    const result = await this.savedModel.deleteOne({ customerId, listingId });
    return { deleted: result.deletedCount > 0 };
  }

  async getSavedListings(customerId: string) {
    const saved = await this.savedModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .lean();

    const listingIds = saved.map((s: any) => s.listingId);
    
    // Get listings by their custom id field only
    const listings = await this.listingModel.find({
      id: { $in: listingIds },
      isPublished: true,
      status: 'published',
    }).lean();

    // Create lookup map
    const listingMap = new Map();
    for (const listing of listings) {
      listingMap.set(listing.id, listing);
      listingMap.set(String(listing._id), listing);
    }

    // Return saved with listing data
    return saved.map((s: any) => ({
      ...s,
      listing: listingMap.get(s.listingId) || null,
    }));
  }

  async isSaved(customerId: string, listingId: string): Promise<boolean> {
    const exists = await this.savedModel.findOne({ customerId, listingId });
    return !!exists;
  }

  // ============ RECENTLY VIEWED ============
  async addRecentlyViewed(customerId: string, payload: SaveListingPayload) {
    // Upsert - update if exists, create if not
    await this.viewedModel.findOneAndUpdate(
      {
        customerId,
        listingId: payload.listingId,
      },
      {
        $set: {
          customerId,
          listingId: payload.listingId,
          vin: payload.vin || '',
          slug: payload.slug || '',
          viewedAt: new Date(),
        },
        $setOnInsert: {
          id: uuidv4(),
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    // Keep only last 30 items
    const count = await this.viewedModel.countDocuments({ customerId });
    if (count > 30) {
      const toDelete = await this.viewedModel
        .find({ customerId })
        .sort({ viewedAt: 1 })
        .limit(count - 30);

      const ids = toDelete.map((d: any) => d._id);
      await this.viewedModel.deleteMany({ _id: { $in: ids } });
    }
  }

  async getRecentlyViewed(customerId: string, limit = 20) {
    const viewed = await this.viewedModel
      .find({ customerId })
      .sort({ viewedAt: -1 })
      .limit(limit)
      .lean();

    const listingIds = viewed.map((v: any) => v.listingId);

    // Get listings by their custom id field only
    const listings = await this.listingModel.find({
      id: { $in: listingIds },
      isPublished: true,
      status: 'published',
    }).lean();

    const listingMap = new Map();
    for (const listing of listings) {
      listingMap.set(listing.id, listing);
      listingMap.set(String(listing._id), listing);
    }

    return viewed.map((v: any) => ({
      ...v,
      listing: listingMap.get(v.listingId) || null,
    }));
  }

  async clearRecentlyViewed(customerId: string) {
    await this.viewedModel.deleteMany({ customerId });
    return { cleared: true };
  }
}
