/**
 * Favorite Schema
 * 
 * Збереження улюблених авто користувачів
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FavoriteDocument = Favorite & Document;

@Schema({ timestamps: true })
export class Favorite {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  vehicleId: string;

  @Prop({ required: true, index: true })
  vin: string;

  @Prop()
  sourcePage?: string;

  @Prop({ type: Object, default: {} })
  metadataSnapshot?: Record<string, any>;
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);
FavoriteSchema.index({ userId: 1, vehicleId: 1 }, { unique: true });
FavoriteSchema.index({ vin: 1 });
FavoriteSchema.index({ createdAt: -1 });
