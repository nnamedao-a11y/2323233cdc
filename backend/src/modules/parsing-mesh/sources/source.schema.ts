/**
 * Source Schema - Production Ready
 * 
 * MongoDB модель для VIN джерел з повним lifecycle management
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MeshSourceDocument = MeshSource & Document;

@Schema({ timestamps: true, collection: 'mesh_sources' })
export class MeshSource {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  domain: string;

  @Prop({ default: '' })
  displayName: string;

  @Prop({ 
    required: true, 
    enum: ['google', 'search_form', 'html', 'json', 'rss', 'nhtsa'],
    default: 'html'
  })
  parserKind: string;

  @Prop({ 
    enum: ['auction', 'aggregator', 'competitor', 'classified', 'fallback'],
    default: 'aggregator'
  })
  type: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 10 })
  priority: number;

  // ========== SCORING ==========
  
  @Prop({ default: 0.5, min: 0, max: 1 })
  trustScore: number;

  @Prop({ default: 0, min: 0, max: 1 })
  vinHitRate: number;

  @Prop({ default: 0, min: 0, max: 1 })
  dataCompleteness: number;

  @Prop({ default: 0.5, min: 0, max: 1 })
  freshnessScore: number;

  @Prop({ default: 0 })
  avgLatency: number;

  // ========== CONFIGURATION ==========

  @Prop({ type: Object, default: {} })
  requestConfig: {
    searchUrl?: string;
    detailUrl?: string;
    method?: string;
    headers?: Record<string, string>;
    timeout?: number;
    rateLimit?: number;
    needsProxy?: boolean;
    followRedirects?: boolean;
  };

  @Prop({ type: Object, default: {} })
  selectorConfig: {
    vin?: string;
    title?: string;
    titleSelector?: string;
    price?: string;
    saleDate?: string;
    lotNumber?: string;
    mileage?: string;
    damage?: string;
    location?: string;
    images?: string;
    make?: string;
    model?: string;
    year?: string;
    resultContainer?: string;
    nextPage?: string;
    urlSelector?: string;
  };

  @Prop({ type: [String], default: ['5YJSA1DN2CFP09123', '1G1JC524717100001', 'WBA3A5C50CF256671'] })
  sampleVins: string[];

  // ========== LIFECYCLE STATUS ==========

  @Prop({ 
    enum: ['draft', 'testing', 'active', 'degraded', 'disabled', 'quarantined'],
    default: 'draft'
  })
  status: string;

  @Prop({ default: false })
  quarantine: boolean;

  @Prop({ default: null })
  quarantineReason: string;

  @Prop({ default: null })
  cooldownUntil: Date;

  // ========== STATS ==========

  @Prop({ default: 0 })
  totalSearches: number;

  @Prop({ default: 0 })
  successfulSearches: number;

  @Prop({ default: 0 })
  failedSearches: number;

  @Prop({ default: 0 })
  emptySearches: number;

  @Prop({ default: 0 })
  exactMatchCount: number;

  @Prop({ default: 0 })
  consecutiveFailures: number;

  @Prop({ default: 0 })
  consecutiveSuccesses: number;

  // ========== TIMESTAMPS ==========

  @Prop({ default: null })
  lastSuccessAt: Date;

  @Prop({ default: null })
  lastFailureAt: Date;

  @Prop({ default: null })
  lastTestedAt: Date;

  @Prop({ default: null })
  lastHealthCheckAt: Date;

  // ========== METADATA ==========

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const MeshSourceSchema = SchemaFactory.createForClass(MeshSource);

// Indexes
MeshSourceSchema.index({ enabled: 1, status: 1, priority: 1 });
MeshSourceSchema.index({ domain: 1 });
MeshSourceSchema.index({ parserKind: 1 });
MeshSourceSchema.index({ type: 1 });
MeshSourceSchema.index({ vinHitRate: -1 });
MeshSourceSchema.index({ trustScore: -1 });
