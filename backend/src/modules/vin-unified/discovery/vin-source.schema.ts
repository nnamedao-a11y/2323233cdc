/**
 * VIN Source Schema
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'vin_sources' })
export class VinSource extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  domain: string;

  @Prop({ required: true })
  urlPattern: string;

  @Prop({ required: true, enum: ['nhtsa', 'json', 'html_light', 'html_heavy'] })
  type: string;

  @Prop({ required: true, min: 1, max: 3 })
  tier: number;

  @Prop({ default: 50 })
  priority: number;

  @Prop({ default: 0.5, min: 0, max: 1 })
  trustScore: number;

  @Prop({ default: true })
  enabled: boolean;

  // Stats
  @Prop({ default: 0 })
  totalRequests: number;

  @Prop({ default: 0 })
  successfulRequests: number;

  @Prop({ default: 0 })
  avgLatencyMs: number;

  @Prop()
  lastSuccessAt?: Date;

  @Prop()
  lastFailureAt?: Date;

  @Prop({ default: 0 })
  consecutiveFailures: number;

  @Prop({ default: false })
  quarantine: boolean;

  @Prop()
  quarantineUntil?: Date;
}

export const VinSourceSchema = SchemaFactory.createForClass(VinSource);

// Indexes
VinSourceSchema.index({ name: 1 }, { unique: true });
VinSourceSchema.index({ tier: 1, priority: -1 });
VinSourceSchema.index({ enabled: 1 });
