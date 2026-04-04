/**
 * Smart Campaign Log Schema
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SmartCampaignLogDocument = SmartCampaignLog & Document;

export enum CampaignTrigger {
  MANUAL = 'manual',
  AUCTION_SOON = 'auction_soon',
  PRICE_DROP = 'price_drop',
  USER_INACTIVE = 'user_inactive',
  HOT_USER = 'hot_user',
  SCHEDULED = 'scheduled',
}

@Schema({ timestamps: true })
export class SmartCampaignLog {
  @Prop({ required: true })
  campaignId: string;

  @Prop({ required: true })
  userId: string;

  @Prop()
  vin?: string;

  @Prop({ type: String, enum: CampaignTrigger, default: CampaignTrigger.MANUAL })
  trigger: CampaignTrigger;

  @Prop({ required: true })
  channel: string; // sms, telegram, whatsapp, email

  @Prop({ required: true })
  message: string;

  @Prop({ default: false })
  aiGenerated: boolean;

  @Prop()
  aiPrompt?: string;

  @Prop({ type: Object, default: {} })
  userContext: {
    intentScore?: number;
    intentLevel?: string;
    favoritesCount?: number;
    comparesCount?: number;
    lastActivityAt?: Date;
    name?: string;
    phone?: string;
  };

  @Prop({ default: 'pending' })
  status: string; // pending, sent, delivered, failed, opened, replied

  @Prop()
  sentAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  openedAt?: Date;

  @Prop()
  repliedAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop()
  externalMessageId?: string;
}

export const SmartCampaignLogSchema = SchemaFactory.createForClass(SmartCampaignLog);
SmartCampaignLogSchema.index({ campaignId: 1 });
SmartCampaignLogSchema.index({ userId: 1 });
SmartCampaignLogSchema.index({ vin: 1 });
SmartCampaignLogSchema.index({ trigger: 1 });
SmartCampaignLogSchema.index({ status: 1 });
SmartCampaignLogSchema.index({ createdAt: -1 });
