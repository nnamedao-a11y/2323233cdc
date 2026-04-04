/**
 * Source Schema - Extended
 * 
 * MongoDB модель для VIN джерел з auto-optimization полями
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SourceDocument = Source & Document;

@Schema({ timestamps: true, collection: 'sources' })
export class Source {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ default: '' })
  displayName: string;

  @Prop({ default: 'provider' })
  type: string; // 'database', 'aggregator', 'competitor', 'web_search'

  @Prop({ default: true })
  enabled: boolean;

  // Manual weight set by admin (0-1)
  @Prop({ default: 0.7, min: 0, max: 1 })
  manualWeight: number;

  // System computed score based on performance (0-1)
  @Prop({ default: 1, min: 0, max: 1 })
  systemScore: number;

  // Effective weight = manualWeight * systemScore
  @Prop({ default: 0.7, min: 0, max: 1 })
  effectiveWeight: number;

  @Prop({ default: 10 })
  priority: number;

  // Stats counters
  @Prop({ default: 0 })
  successCount: number;

  @Prop({ default: 0 })
  failCount: number;

  @Prop({ default: 0 })
  exactMatchCount: number;

  @Prop({ default: 0 })
  emptyResultCount: number;

  @Prop({ default: 0 })
  invalidResultCount: number;

  @Prop({ default: 0 })
  totalSearches: number;

  @Prop({ default: 0 })
  consecutiveFailCount: number;

  // Timestamps
  @Prop({ default: null })
  lastSuccessAt?: Date;

  @Prop({ default: null })
  lastFailAt?: Date;

  @Prop({ default: null })
  lastUsedAt?: Date;

  // Performance metrics
  @Prop({ default: 0 })
  avgResponseTime: number;

  @Prop({ default: 0 })
  lastResultCount: number;

  @Prop({ default: false })
  lastExactMatch: boolean;

  @Prop({ default: 0 })
  vinHitRate: number;

  // Auto-management
  @Prop({ default: false })
  autoDisabled: boolean;

  @Prop({ default: null })
  autoDisabledReason?: string;

  @Prop({ default: '' })
  baseUrl?: string;

  @Prop({ default: '' })
  description?: string;
}

export const SourceSchema = SchemaFactory.createForClass(Source);

// Indexes
SourceSchema.index({ enabled: 1, autoDisabled: 1, effectiveWeight: -1 });
SourceSchema.index({ name: 1 });
