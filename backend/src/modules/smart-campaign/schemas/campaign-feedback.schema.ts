/**
 * Campaign Feedback Schema
 * 
 * Для Learning Revenue System - логування результатів
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CampaignFeedbackDocument = CampaignFeedback & Document;

@Schema({ timestamps: true })
export class CampaignFeedback {
  @Prop({ required: true })
  campaignLogId: string;

  @Prop({ required: true })
  userId: string;

  @Prop()
  vin?: string;

  // User engagement after campaign
  @Prop({ default: false })
  opened: boolean;

  @Prop({ default: false })
  clicked: boolean;

  @Prop({ default: false })
  replied: boolean;

  @Prop({ default: false })
  becameHot: boolean;

  @Prop({ default: false })
  becameLead: boolean;

  @Prop({ default: false })
  becameDeal: boolean;

  @Prop({ default: false })
  becameDeposit: boolean;

  // Intent score changes
  @Prop()
  intentScoreBefore?: number;

  @Prop()
  intentScoreAfter?: number;

  // Revenue impact
  @Prop()
  dealValue?: number;

  @Prop()
  depositValue?: number;

  // Timing metrics
  @Prop()
  responseTimeMinutes?: number;

  @Prop()
  conversionTimeHours?: number;

  // Channel effectiveness
  @Prop()
  channel?: string;

  // AI message quality
  @Prop()
  messageRating?: number; // 1-5

  @Prop()
  messageType?: string; // auction_soon, price_drop, etc.
}

export const CampaignFeedbackSchema = SchemaFactory.createForClass(CampaignFeedback);
CampaignFeedbackSchema.index({ campaignLogId: 1 });
CampaignFeedbackSchema.index({ userId: 1 });
CampaignFeedbackSchema.index({ becameLead: 1 });
CampaignFeedbackSchema.index({ becameDeal: 1 });
CampaignFeedbackSchema.index({ channel: 1 });
