/**
 * Auction Fee Rule Schema
 * 
 * Bracket-based auction fees (залежить від ціни авто)
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuctionFeeRuleDocument = AuctionFeeRule & Document;

@Schema({ timestamps: true })
export class AuctionFeeRule {
  @Prop({ required: true })
  profileCode: string;

  @Prop({ required: true })
  minBid: number;

  @Prop({ required: true })
  maxBid: number;

  @Prop({ required: true })
  fee: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  description?: string;
}

export const AuctionFeeRuleSchema = SchemaFactory.createForClass(AuctionFeeRule);

// Index for quick bracket lookup
AuctionFeeRuleSchema.index({ profileCode: 1, minBid: 1, maxBid: 1 });
