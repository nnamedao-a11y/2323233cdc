/**
 * User History Quota Schema
 * 
 * Ліміти та статистика history reports per user
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserHistoryQuotaDocument = UserHistoryQuota & Document;

@Schema({ timestamps: true })
export class UserHistoryQuota {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ default: 0 })
  freeReportsUsed: number;

  @Prop({ default: 0 })
  paidReportsUsed: number;

  @Prop()
  lastRequestAt?: Date;

  @Prop({ default: 0 })
  totalSpend: number;

  @Prop({ default: false })
  isRestricted: boolean;

  @Prop()
  restrictedAt?: Date;

  @Prop()
  restrictionReason?: string;

  @Prop({ default: 0 })
  abuseFlags: number;
}

export const UserHistoryQuotaSchema = SchemaFactory.createForClass(UserHistoryQuota);
