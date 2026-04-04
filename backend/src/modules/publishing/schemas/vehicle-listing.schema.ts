import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VehicleListingDocument = VehicleListing & Document;

/**
 * Vehicle Listing Schema - Publishing / Moderation Layer
 * 
 * Pipeline: parsed → normalized → pending_review → approved → published → archived
 */

export enum ListingStatus {
  PARSED = 'parsed',           // Raw data parsed from source
  NORMALIZED = 'normalized',   // Data normalized/cleaned
  PENDING_REVIEW = 'pending_review', // Waiting for manual review
  APPROVED = 'approved',       // Approved, ready to publish
  REJECTED = 'rejected',       // Rejected by moderator
  PUBLISHED = 'published',     // Live on public site
  UNPUBLISHED = 'unpublished', // Removed from public, kept in DB
  ARCHIVED = 'archived',       // Old/sold vehicles
}

export enum ListingSource {
  COPART = 'copart',
  IAAI = 'iaai',
  MANHEIM = 'manheim',
  MANUAL = 'manual',
  IMPORT = 'import',
}

@Schema({ timestamps: true, collection: 'vehiclelistings' })
export class VehicleListing {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  vin: string;

  @Prop({ enum: ListingSource, default: ListingSource.MANUAL, index: true })
  source: ListingSource;

  @Prop()
  sourceId?: string; // ID from source system (lot number, etc.)

  @Prop()
  sourceUrl?: string;

  // ============ RAW DATA ============
  @Prop({ type: Object })
  rawData?: Record<string, any>;

  // ============ NORMALIZED DATA ============
  @Prop()
  make?: string;

  @Prop()
  model?: string;

  @Prop()
  year?: number;

  @Prop()
  trim?: string;

  @Prop()
  engineType?: string;

  @Prop()
  transmission?: string;

  @Prop()
  driveType?: string;

  @Prop()
  fuelType?: string;

  @Prop()
  bodyType?: string;

  @Prop()
  color?: string;

  @Prop()
  interiorColor?: string;

  @Prop()
  mileage?: number;

  @Prop()
  mileageUnit?: string;

  // ============ CONDITION ============
  @Prop()
  damageType?: string; // front, rear, side, etc.

  @Prop()
  primaryDamage?: string;

  @Prop()
  secondaryDamage?: string;

  @Prop()
  titleStatus?: string; // clean, salvage, rebuilt

  @Prop()
  saleStatus?: string; // pure_sale, minimum_bid, etc.

  @Prop()
  hasKeys?: boolean;

  @Prop()
  isRunnable?: boolean;

  // ============ PRICING ============
  @Prop()
  estimatedRetail?: number;

  @Prop()
  estimatedRepairCost?: number;

  @Prop()
  currentBid?: number;

  @Prop()
  buyNowPrice?: number;

  @Prop()
  soldPrice?: number;

  @Prop()
  currency?: string;

  // ============ AUCTION INFO ============
  @Prop()
  auctionDate?: Date;

  @Prop()
  auctionLocation?: string;

  @Prop()
  lotNumber?: string;

  @Prop()
  lane?: string;

  @Prop()
  row?: string;

  // ============ IMAGES ============
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop()
  primaryImage?: string;

  @Prop({ type: [String], default: [] })
  damageImages: string[];

  // ============ PUBLISHING ============
  @Prop({ enum: ListingStatus, default: ListingStatus.PARSED, index: true })
  status: ListingStatus;

  @Prop({ default: false, index: true })
  isPublished: boolean;

  @Prop()
  publishedAt?: Date;

  @Prop()
  unpublishedAt?: Date;

  @Prop()
  publishedBy?: string;

  // ============ MODERATION ============
  @Prop()
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  rejectionReason?: string;

  @Prop({ type: [String], default: [] })
  moderationNotes: string[];

  @Prop({ default: 0 })
  editCount: number;

  // ============ SEO ============
  @Prop()
  slug?: string;

  @Prop()
  metaTitle?: string;

  @Prop()
  metaDescription?: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  // ============ CONTENT ============
  @Prop()
  title?: string; // Auto-generated or custom

  @Prop()
  description?: string;

  @Prop()
  shortDescription?: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ type: [String], default: [] })
  highlights: string[];

  // ============ AI ENRICHMENT ============
  @Prop()
  aiDescription?: string;

  @Prop()
  aiShortSummary?: string;

  @Prop()
  managerHint?: string;

  @Prop({ type: [String], default: [] })
  aiFaq: string[];

  @Prop()
  aiEnrichedAt?: Date;

  @Prop({ default: false })
  isAiEnriched: boolean;

  // ============ TRACKING ============
  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ default: 0 })
  inquiryCount: number;

  @Prop()
  lastViewedAt?: Date;

  // ============ RELATIONS ============
  @Prop()
  dealId?: string;

  @Prop()
  customerId?: string;

  @Prop()
  managerId?: string;

  // ============ SYSTEM ============
  @Prop()
  createdBy?: string;

  @Prop()
  updatedBy?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const VehicleListingSchema = SchemaFactory.createForClass(VehicleListing);

// Indexes
VehicleListingSchema.index({ vin: 1, source: 1 }, { unique: true });
VehicleListingSchema.index({ status: 1, isPublished: 1 });
VehicleListingSchema.index({ make: 1, model: 1, year: 1 });
VehicleListingSchema.index({ auctionDate: 1 });
VehicleListingSchema.index({ createdAt: -1 });
VehicleListingSchema.index({ publishedAt: -1 });
VehicleListingSchema.index({ '$**': 'text' }, { name: 'text_search' });
