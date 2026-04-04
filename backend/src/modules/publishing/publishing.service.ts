import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VehicleListing, VehicleListingDocument, ListingStatus, ListingSource } from './schemas/vehicle-listing.schema';
import { generateId } from '../../shared/utils';

/**
 * Publishing Service - Vehicle Listing Management
 * 
 * Handles the complete publishing pipeline:
 * RAW DATA → CLEAN → VERIFIED → PUBLIC
 */

// Status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  [ListingStatus.PARSED]: [ListingStatus.NORMALIZED, ListingStatus.REJECTED],
  [ListingStatus.NORMALIZED]: [ListingStatus.PENDING_REVIEW, ListingStatus.REJECTED],
  [ListingStatus.PENDING_REVIEW]: [ListingStatus.APPROVED, ListingStatus.REJECTED],
  [ListingStatus.APPROVED]: [ListingStatus.PUBLISHED, ListingStatus.REJECTED],
  [ListingStatus.REJECTED]: [ListingStatus.PENDING_REVIEW], // Can re-submit
  [ListingStatus.PUBLISHED]: [ListingStatus.UNPUBLISHED, ListingStatus.ARCHIVED],
  [ListingStatus.UNPUBLISHED]: [ListingStatus.PUBLISHED, ListingStatus.ARCHIVED],
  [ListingStatus.ARCHIVED]: [], // Final state
};

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    @InjectModel(VehicleListing.name) private listingModel: Model<VehicleListingDocument>,
  ) {}

  // ============ INGEST FROM PARSER ============
  async ingestFromParser(data: {
    vin: string;
    source: ListingSource;
    sourceId?: string;
    sourceUrl?: string;
    rawData: Record<string, any>;
  }): Promise<VehicleListingDocument> {
    // Check if exists
    const existing = await this.listingModel.findOne({
      vin: data.vin,
      source: data.source,
      isDeleted: false,
    });

    if (existing) {
      // Update raw data
      existing.rawData = { ...existing.rawData, ...data.rawData };
      existing.sourceUrl = data.sourceUrl || existing.sourceUrl;
      await existing.save();
      return existing;
    }

    // Create new
    const listing = new this.listingModel({
      id: generateId(),
      ...data,
      status: ListingStatus.PARSED,
    });

    await listing.save();
    this.logger.log(`Ingested listing for VIN: ${data.vin} from ${data.source}`);
    return listing;
  }

  // ============ NORMALIZE DATA ============
  async normalize(id: string, normalizedData: {
    make?: string;
    model?: string;
    year?: number;
    trim?: string;
    engineType?: string;
    transmission?: string;
    driveType?: string;
    fuelType?: string;
    bodyType?: string;
    color?: string;
    interiorColor?: string;
    mileage?: number;
    damageType?: string;
    primaryDamage?: string;
    secondaryDamage?: string;
    titleStatus?: string;
    hasKeys?: boolean;
    isRunnable?: boolean;
    estimatedRetail?: number;
    estimatedRepairCost?: number;
    currentBid?: number;
    buyNowPrice?: number;
    auctionDate?: Date;
    auctionLocation?: string;
    lotNumber?: string;
    images?: string[];
    primaryImage?: string;
  }, userId?: string): Promise<VehicleListingDocument> {
    const listing = await this.listingModel.findOne({ id, isDeleted: false });
    if (!listing) throw new NotFoundException('Listing not found');

    // Auto-generate title and slug
    const title = this.generateTitle(normalizedData);
    const slug = this.generateSlug(normalizedData, listing.vin);
    const description = this.generateDescription(normalizedData);

    Object.assign(listing, {
      ...normalizedData,
      title,
      slug,
      description,
      status: ListingStatus.NORMALIZED,
      updatedBy: userId,
      editCount: listing.editCount + 1,
    });

    await listing.save();
    this.logger.log(`Normalized listing ${id}`);
    return listing;
  }

  // ============ SUBMIT FOR REVIEW ============
  async submitForReview(id: string, userId?: string): Promise<VehicleListingDocument> {
    const listing = await this.findById(id);
    
    if (listing.status !== ListingStatus.NORMALIZED && listing.status !== ListingStatus.REJECTED) {
      throw new BadRequestException(`Cannot submit for review from status: ${listing.status}`);
    }

    listing.status = ListingStatus.PENDING_REVIEW;
    listing.updatedBy = userId;
    await listing.save();

    this.logger.log(`Listing ${id} submitted for review`);
    return listing;
  }

  // ============ MODERATION: APPROVE ============
  async approve(id: string, userId: string, notes?: string): Promise<VehicleListingDocument> {
    const listing = await this.findById(id);

    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Cannot approve from status: ${listing.status}`);
    }

    listing.status = ListingStatus.APPROVED;
    listing.reviewedBy = userId;
    listing.reviewedAt = new Date();
    if (notes) listing.moderationNotes.push(notes);
    await listing.save();

    this.logger.log(`Listing ${id} approved by ${userId}`);
    return listing;
  }

  // ============ MODERATION: REJECT ============
  async reject(id: string, userId: string, reason: string): Promise<VehicleListingDocument> {
    const listing = await this.findById(id);

    listing.status = ListingStatus.REJECTED;
    listing.reviewedBy = userId;
    listing.reviewedAt = new Date();
    listing.rejectionReason = reason;
    listing.moderationNotes.push(`Rejected: ${reason}`);
    await listing.save();

    this.logger.log(`Listing ${id} rejected by ${userId}: ${reason}`);
    return listing;
  }

  // ============ PUBLISH ============
  async publish(id: string, userId: string): Promise<VehicleListingDocument> {
    const listing = await this.findById(id);

    if (listing.status !== ListingStatus.APPROVED && listing.status !== ListingStatus.UNPUBLISHED) {
      throw new BadRequestException(`Cannot publish from status: ${listing.status}`);
    }

    // Validate required fields
    this.validateForPublishing(listing);

    listing.status = ListingStatus.PUBLISHED;
    listing.isPublished = true;
    listing.publishedAt = new Date();
    listing.publishedBy = userId;
    listing.unpublishedAt = undefined;
    await listing.save();

    this.logger.log(`Listing ${id} published by ${userId}`);
    return listing;
  }

  // ============ UNPUBLISH ============
  async unpublish(id: string, userId: string, reason?: string): Promise<VehicleListingDocument> {
    const listing = await this.findById(id);

    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new BadRequestException(`Cannot unpublish from status: ${listing.status}`);
    }

    listing.status = ListingStatus.UNPUBLISHED;
    listing.isPublished = false;
    listing.unpublishedAt = new Date();
    listing.updatedBy = userId;
    if (reason) listing.moderationNotes.push(`Unpublished: ${reason}`);
    await listing.save();

    this.logger.log(`Listing ${id} unpublished by ${userId}`);
    return listing;
  }

  // ============ ARCHIVE ============
  async archive(id: string, userId: string, reason?: string): Promise<VehicleListingDocument> {
    const listing = await this.findById(id);

    listing.status = ListingStatus.ARCHIVED;
    listing.isPublished = false;
    listing.updatedBy = userId;
    if (reason) listing.moderationNotes.push(`Archived: ${reason}`);
    await listing.save();

    this.logger.log(`Listing ${id} archived by ${userId}`);
    return listing;
  }

  // ============ BULK OPERATIONS ============
  async bulkApprove(ids: string[], userId: string): Promise<number> {
    const result = await this.listingModel.updateMany(
      { id: { $in: ids }, status: ListingStatus.PENDING_REVIEW, isDeleted: false },
      {
        $set: {
          status: ListingStatus.APPROVED,
          reviewedBy: userId,
          reviewedAt: new Date(),
        },
        $push: { moderationNotes: 'Bulk approved' }
      }
    );
    return result.modifiedCount;
  }

  async bulkPublish(ids: string[], userId: string): Promise<number> {
    const result = await this.listingModel.updateMany(
      { id: { $in: ids }, status: ListingStatus.APPROVED, isDeleted: false },
      {
        $set: {
          status: ListingStatus.PUBLISHED,
          isPublished: true,
          publishedAt: new Date(),
          publishedBy: userId,
        }
      }
    );
    return result.modifiedCount;
  }

  // ============ QUERY METHODS ============
  async findById(id: string): Promise<VehicleListingDocument> {
    const listing = await this.listingModel.findOne({ id, isDeleted: false });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async findByVin(vin: string): Promise<VehicleListingDocument[]> {
    return this.listingModel.find({ vin, isDeleted: false }).sort({ createdAt: -1 });
  }

  async getModerationQueue(query: {
    page?: number;
    limit?: number;
    status?: ListingStatus;
  }): Promise<{ data: VehicleListingDocument[]; total: number; page: number; totalPages: number }> {
    const { page = 1, limit = 20, status = ListingStatus.PENDING_REVIEW } = query;

    const filter: any = { isDeleted: false, status };

    const [data, total] = await Promise.all([
      this.listingModel
        .find(filter)
        .sort({ createdAt: 1 }) // FIFO
        .skip((page - 1) * limit)
        .limit(limit),
      this.listingModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPublished(query: {
    page?: number;
    limit?: number;
    make?: string;
    model?: string;
    year?: number;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ data: VehicleListingDocument[]; total: number; page: number; totalPages: number }> {
    const { 
      page = 1, 
      limit = 20, 
      make, 
      model, 
      year,
      minPrice,
      maxPrice,
      search,
      sortBy = 'publishedAt',
      sortOrder = 'desc'
    } = query;

    const filter: any = { isDeleted: false, isPublished: true, status: ListingStatus.PUBLISHED };

    if (make) filter.make = { $regex: make, $options: 'i' };
    if (model) filter.model = { $regex: model, $options: 'i' };
    if (year) filter.year = year;
    if (minPrice || maxPrice) {
      filter.currentBid = {};
      if (minPrice) filter.currentBid.$gte = minPrice;
      if (maxPrice) filter.currentBid.$lte = maxPrice;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { vin: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.listingModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.listingModel.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats(): Promise<any> {
    const [byStatus, total, published] = await Promise.all([
      this.listingModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.listingModel.countDocuments({ isDeleted: false }),
      this.listingModel.countDocuments({ isDeleted: false, isPublished: true }),
    ]);

    const statusMap = byStatus.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});

    return {
      total,
      published,
      pendingReview: statusMap[ListingStatus.PENDING_REVIEW] || 0,
      approved: statusMap[ListingStatus.APPROVED] || 0,
      rejected: statusMap[ListingStatus.REJECTED] || 0,
      archived: statusMap[ListingStatus.ARCHIVED] || 0,
      byStatus: statusMap,
    };
  }

  // ============ UPDATE LISTING ============
  async update(id: string, data: Partial<VehicleListing>, userId?: string): Promise<VehicleListingDocument> {
    const listing = await this.findById(id);
    
    Object.assign(listing, data, {
      updatedBy: userId,
      editCount: listing.editCount + 1,
    });

    await listing.save();
    return listing;
  }

  // ============ SOFT DELETE ============
  async delete(id: string, userId?: string): Promise<boolean> {
    const result = await this.listingModel.findOneAndUpdate(
      { id },
      { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: userId, isPublished: false } }
    );
    return !!result;
  }

  // ============ INCREMENT VIEW COUNT ============
  async incrementViewCount(id: string): Promise<void> {
    await this.listingModel.updateOne(
      { id },
      { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } }
    );
  }

  async incrementViewCountBySlug(slug: string): Promise<void> {
    await this.listingModel.updateOne(
      { slug, isPublished: true },
      { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } }
    );
  }

  // ============ PUBLIC API - GET BY SLUG ============
  async getPublicBySlug(slug: string): Promise<VehicleListingDocument> {
    const listing = await this.listingModel.findOne({ 
      slug, 
      isPublished: true, 
      status: ListingStatus.PUBLISHED,
      isDeleted: false 
    });
    if (!listing) throw new NotFoundException('Vehicle not found');
    
    // Increment view
    await this.incrementViewCountBySlug(slug);
    
    return listing;
  }

  // ============ PUBLIC API - FILTERED LISTINGS ============
  async getPublicListings(filters: {
    page?: number;
    limit?: number;
    make?: string;
    model?: string;
    year?: number;
    minPrice?: number;
    maxPrice?: number;
    auction?: boolean;
    featured?: boolean;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ items: any[]; total: number; page: number; limit: number }> {
    const { 
      page = 1, 
      limit = 20, 
      make, 
      model, 
      year,
      minPrice,
      maxPrice,
      auction,
      featured,
      search,
      sortBy = 'publishedAt',
      sortOrder = 'desc'
    } = filters;

    const query: any = { 
      isPublished: true, 
      status: ListingStatus.PUBLISHED,
      isDeleted: false 
    };

    if (make) query.make = { $regex: make, $options: 'i' };
    if (model) query.model = { $regex: model, $options: 'i' };
    if (year) query.year = Number(year);
    if (auction) query.auctionDate = { $exists: true };
    if (featured) query.isFeatured = true;
    
    if (minPrice || maxPrice) {
      query.$or = [
        { currentBid: {} },
        { buyNowPrice: {} },
        { estimatedRetail: {} }
      ];
      if (minPrice) {
        query.$or[0].currentBid.$gte = Number(minPrice);
        query.$or[1].buyNowPrice.$gte = Number(minPrice);
        query.$or[2].estimatedRetail.$gte = Number(minPrice);
      }
      if (maxPrice) {
        query.$or[0].currentBid.$lte = Number(maxPrice);
        query.$or[1].buyNowPrice.$lte = Number(maxPrice);
        query.$or[2].estimatedRetail.$lte = Number(maxPrice);
      }
    }

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.listingModel
        .find(query)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.listingModel.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }

  // ============ HELPER METHODS ============
  private generateTitle(data: any): string {
    const parts: string[] = [];
    if (data.year) parts.push(String(data.year));
    if (data.make) parts.push(data.make);
    if (data.model) parts.push(data.model);
    if (data.trim) parts.push(data.trim);
    return parts.join(' ') || 'Vehicle Listing';
  }

  private generateSlug(data: any, vin: string): string {
    const parts: string[] = [];
    if (data.year) parts.push(String(data.year));
    if (data.make) parts.push(data.make.toLowerCase());
    if (data.model) parts.push(data.model.toLowerCase().replace(/\s+/g, '-'));
    parts.push(vin.slice(-6).toLowerCase());
    return parts.join('-');
  }

  private generateDescription(data: any): string {
    const parts: string[] = [];
    
    if (data.year && data.make && data.model) {
      parts.push(`${data.year} ${data.make} ${data.model}${data.trim ? ` ${data.trim}` : ''}`);
    }
    
    if (data.mileage) {
      parts.push(`Пробіг: ${data.mileage.toLocaleString()} ${data.mileageUnit || 'mi'}`);
    }
    
    if (data.engineType) parts.push(`Двигун: ${data.engineType}`);
    if (data.transmission) parts.push(`КПП: ${data.transmission}`);
    if (data.color) parts.push(`Колір: ${data.color}`);
    if (data.titleStatus) parts.push(`Тайтл: ${data.titleStatus}`);
    if (data.damageType) parts.push(`Пошкодження: ${data.damageType}`);
    
    return parts.join('. ');
  }

  private validateForPublishing(listing: VehicleListingDocument): void {
    const required = ['vin', 'make', 'model', 'year', 'title'];
    const missing = required.filter(field => !(listing as any)[field]);
    
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required fields for publishing: ${missing.join(', ')}`);
    }

    if (!listing.images || listing.images.length === 0) {
      this.logger.warn(`Publishing listing ${listing.id} without images`);
    }
  }
}
