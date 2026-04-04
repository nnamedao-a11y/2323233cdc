/**
 * VIN Cache Schema
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, collection: 'vin_cache' })
export class VinCache extends Document {
  @Prop({ required: true, unique: true, index: true })
  vin: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: Record<string, any>;

  @Prop({ required: true })
  status: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;
}

export const VinCacheSchema = SchemaFactory.createForClass(VinCache);

// TTL index for auto-cleanup
VinCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
