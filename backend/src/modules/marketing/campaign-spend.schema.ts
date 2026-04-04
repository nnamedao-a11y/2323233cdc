import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CampaignSpendDocument = CampaignSpend & Document;

@Schema({ timestamps: true, collection: 'campaign_spends' })
export class CampaignSpend {
  @Prop({ required: true })
  campaign: string;

  @Prop({ required: true })
  campaignId: string;

  @Prop({ required: true, default: 0 })
  spend: number;

  @Prop({ default: 0 })
  clicks: number;

  @Prop({ default: 0 })
  impressions: number;

  @Prop({ default: 0 })
  cpc: number;

  @Prop({ default: 0 })
  cpm: number;

  @Prop({ default: 0 })
  ctr: number;

  @Prop()
  dateStart: string;

  @Prop()
  dateStop: string;

  @Prop()
  syncedAt: Date;
}

export const CampaignSpendSchema = SchemaFactory.createForClass(CampaignSpend);

// Indexes
CampaignSpendSchema.index({ campaign: 1 });
CampaignSpendSchema.index({ campaignId: 1 }, { unique: true });
CampaignSpendSchema.index({ syncedAt: -1 });
