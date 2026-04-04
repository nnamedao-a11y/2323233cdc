/**
 * Market Data Schema
 * 
 * Агреговані ринкові дані для швидкої оцінки
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MarketDataDocument = MarketData & Document;

@Schema({ timestamps: true, collection: 'market_data' })
export class MarketData {
  @Prop({ required: true })
  make: string;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  year: number;

  // Price statistics
  @Prop({ default: 0 })
  avgPrice: number;

  @Prop({ default: 0 })
  medianPrice: number;

  @Prop({ default: 0 })
  minPrice: number;

  @Prop({ default: 0 })
  maxPrice: number;

  @Prop({ default: 0 })
  priceStdDev: number;

  // Auction statistics
  @Prop({ default: 0 })
  avgAuctionPrice: number;

  @Prop({ default: 0 })
  avgSoldPrice: number;

  // Volume
  @Prop({ default: 0 })
  sampleSize: number;

  @Prop({ default: 0 })
  soldCount: number;

  // Adjustments
  @Prop({ type: Object, default: {} })
  mileageAdjustment: {
    perMile: number;
    avgMileage: number;
  };

  @Prop({ type: Object, default: {} })
  damageAdjustment: Record<string, number>;

  @Prop({ default: null })
  lastUpdated: Date;

  @Prop({ default: 0.5 })
  confidence: number;
}

export const MarketDataSchema = SchemaFactory.createForClass(MarketData);

MarketDataSchema.index({ make: 1, model: 1, year: 1 }, { unique: true });
