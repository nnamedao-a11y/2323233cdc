/**
 * Auction Schema
 * 
 * MongoDB модель для аукціонних лотів з ranking полями
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuctionDocument = Auction & Document;

@Schema({ timestamps: true, collection: 'auctions' })
export class Auction {
  @Prop({ required: true, index: true })
  vin: string;

  @Prop()
  source: string;

  @Prop()
  lotNumber: string;

  @Prop({ index: true })
  auctionDate: Date;

  @Prop()
  location: string;

  @Prop()
  price: number;

  @Prop()
  title: string;

  @Prop()
  make: string;

  @Prop()
  model: string;

  @Prop()
  year: number;

  @Prop()
  mileage: number;

  @Prop()
  damageType: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: false })
  isActive: boolean;

  @Prop({ default: 0 })
  confidence: number;

  @Prop({ default: null })
  lastSeenAt: Date;

  @Prop({ default: null })
  expiresAt: Date;

  // Ranking fields
  @Prop({ default: 0, index: true })
  rankingScore: number;

  @Prop({ default: 0 })
  timerUrgency: number;

  @Prop({ default: 0 })
  dataCompleteness: number;

  @Prop({ default: 0 })
  sourceQuality: number;

  @Prop({ default: 0 })
  imageQuality: number;

  @Prop({ default: 0 })
  priceSignal: number;
}

export const AuctionSchema = SchemaFactory.createForClass(Auction);

// Indexes
AuctionSchema.index({ vin: 1, lotNumber: 1 }, { unique: true });
AuctionSchema.index({ isActive: 1, auctionDate: 1 });
AuctionSchema.index({ rankingScore: -1 });
