import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AutoActionDocument = AutoAction & Document;

export enum ActionType {
  PAUSE = 'pause',
  RESUME = 'resume',
  SCALE_UP = 'scale_up',
  SCALE_DOWN = 'scale_down',
}

export enum ActionStatus {
  PENDING = 'pending',
  EXECUTED = 'executed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Schema({ timestamps: true, collection: 'auto_actions' })
export class AutoAction {
  @Prop({ required: true })
  campaign: string;

  @Prop({ default: '' })
  campaignId: string;

  @Prop()
  adSetId: string;

  @Prop({ type: String, enum: ActionType, required: true })
  actionType: ActionType;

  @Prop({ type: String, enum: ActionStatus, default: ActionStatus.PENDING })
  status: ActionStatus;

  @Prop()
  reason: string;

  @Prop()
  oldValue: number;

  @Prop()
  newValue: number;

  @Prop()
  roi: number;

  @Prop()
  spend: number;

  @Prop()
  profit: number;

  @Prop()
  executedAt: Date;

  @Prop()
  error: string;

  @Prop({ default: false })
  isAuto: boolean;
}

export const AutoActionSchema = SchemaFactory.createForClass(AutoAction);

// Indexes
AutoActionSchema.index({ campaign: 1, createdAt: -1 });
AutoActionSchema.index({ status: 1 });
AutoActionSchema.index({ createdAt: -1 });
