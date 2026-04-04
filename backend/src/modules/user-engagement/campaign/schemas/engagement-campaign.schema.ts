/**
 * Engagement Campaign Schema
 * 
 * Логування кампаній та їх результатів
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EngagementCampaignDocument = EngagementCampaign & Document;

export enum CampaignChannel {
  SMS = 'sms',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
}

export enum CampaignStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class EngagementCampaign {
  @Prop({ required: true })
  vin: string;

  @Prop({ type: String, enum: CampaignChannel, required: true })
  channel: CampaignChannel;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Object, default: {} })
  filter: {
    favorites?: boolean;
    compare?: boolean;
    intentMin?: number;
    onlyHot?: boolean;
  };

  @Prop({ type: String, enum: CampaignStatus, default: CampaignStatus.PENDING })
  status: CampaignStatus;

  @Prop({ default: 0 })
  totalUsers: number;

  @Prop({ default: 0 })
  sentCount: number;

  @Prop({ default: 0 })
  deliveredCount: number;

  @Prop({ default: 0 })
  failedCount: number;

  @Prop()
  completedAt?: Date;

  @Prop()
  createdBy: string;

  @Prop({ type: [Object], default: [] })
  results: Array<{
    userId: string;
    status: 'sent' | 'delivered' | 'failed';
    error?: string;
    sentAt: Date;
  }>;
}

export const EngagementCampaignSchema = SchemaFactory.createForClass(EngagementCampaign);

// Index for fast queries
EngagementCampaignSchema.index({ vin: 1 });
EngagementCampaignSchema.index({ status: 1 });
EngagementCampaignSchema.index({ createdAt: -1 });
