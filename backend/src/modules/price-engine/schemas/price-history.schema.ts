/**
 * Price History Schema
 * 
 * Зберігає історичні ціни для market estimation
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PriceHistoryDocument = PriceHistory & Document;

@Schema({ timestamps: true, collection: 'price_history' })
export class PriceHistory {
  @Prop({ required: true, index: true })
  vin: string;

  @Prop({ required: true })
  make: string;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  year: number;

  @Prop({ default: null })
  soldPrice: number;

  @Prop({ default: null })
  estimatedPrice: number;

  @Prop({ default: null })
  auctionPrice: number;

  @Prop({ default: null })
  mileage: number;

  @Prop({ default: null })
  damage: string;

  @Prop({ default: null })
  location: string;

  @Prop({ default: null })
  source: string;

  @Prop({ default: null })
  auctionDate: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const PriceHistorySchema = SchemaFactory.createForClass(PriceHistory);

PriceHistorySchema.index({ make: 1, model: 1, year: 1 });
PriceHistorySchema.index({ soldPrice: 1 });
PriceHistorySchema.index({ auctionDate: -1 });
