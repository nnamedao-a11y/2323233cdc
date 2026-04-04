/**
 * Discovered Source Schema
 * 
 * MongoDB модель для автоматично знайдених джерел VIN даних
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DiscoveredSourceDocument = DiscoveredSource & Document;

@Schema({ timestamps: true, collection: 'discovered_sources' })
export class DiscoveredSource {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true, index: true })
  domain: string;

  @Prop({ default: false })
  vinSupport: boolean;

  @Prop({ default: 0, min: 0, max: 1 })
  vinCoverageScore: number;

  @Prop({ default: 0, min: 0, max: 1 })
  reliabilityScore: number;

  @Prop({ default: 0 })
  checkCount: number;

  @Prop({ default: 0 })
  successCount: number;

  @Prop({ default: 0 })
  failCount: number;

  @Prop({ default: false })
  addedToRegistry: boolean;

  @Prop({ default: null })
  lastCheckedAt?: Date;

  @Prop({ default: null })
  addedToRegistryAt?: Date;

  @Prop({ default: '' })
  discoveredVia?: string; // 'web_search' | 'aggregator' | 'competitor'

  @Prop({ default: '' })
  discoveredVin?: string; // VIN that was used to discover this source

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;
}

export const DiscoveredSourceSchema = SchemaFactory.createForClass(DiscoveredSource);

// Indexes
DiscoveredSourceSchema.index({ domain: 1 }, { unique: true });
DiscoveredSourceSchema.index({ vinSupport: 1, reliabilityScore: -1 });
DiscoveredSourceSchema.index({ addedToRegistry: 1 });
