import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SeoClusterDocument = SeoCluster & Document;

export enum ClusterType {
  BRAND = 'brand',
  MODEL = 'model',
  BODY_TYPE = 'bodyType',
  BUDGET = 'budget',
  AUCTION = 'auction',
  CUSTOM = 'custom',
}

/**
 * SEO Cluster Schema
 * 
 * Dynamic landing pages for SEO
 * Groups vehicles by brand, model, budget, etc.
 */

@Schema({ timestamps: true, collection: 'seoclusters' })
export class SeoCluster {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ enum: ClusterType, required: true, index: true })
  type: ClusterType;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  seoTitle: string;

  @Prop({ default: '' })
  seoDescription: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ type: [String], default: [] })
  listingIds: string[];

  @Prop({ default: 0 })
  listingCount: number;

  @Prop({ default: true })
  isPublished: boolean;

  @Prop()
  publishedAt?: Date;

  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ type: Object })
  filters?: {
    brand?: string;
    model?: string;
    bodyType?: string;
    minPrice?: number;
    maxPrice?: number;
    auctionSource?: string;
  };
}

export const SeoClusterSchema = SchemaFactory.createForClass(SeoCluster);

SeoClusterSchema.index({ type: 1, isPublished: 1 });
SeoClusterSchema.index({ slug: 'text', title: 'text' });
