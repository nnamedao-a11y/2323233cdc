/**
 * Intent Score Schema
 * 
 * Scoring користувачів: HOT / WARM / COLD
 * + AUTO-LEAD creation при HOT intent
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IntentScoreDocument = IntentScore & Document;

export enum IntentLevel {
  HOT = 'hot',       // Score >= 10
  WARM = 'warm',     // Score 5-9
  COLD = 'cold',     // Score < 5
}

@Schema({ timestamps: true })
export class IntentScore {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ default: 0 })
  score: number;

  @Prop({ default: IntentLevel.COLD, enum: IntentLevel })
  level: IntentLevel;

  // Breakdown
  @Prop({ default: 0 })
  favoritesCount: number;

  @Prop({ default: 0 })
  comparesCount: number;

  @Prop({ default: 0 })
  historyRequestsCount: number;

  @Prop({ default: 0 })
  leadsCreated: number;

  @Prop({ default: 0 })
  vinChecksCount: number;

  @Prop()
  lastActivityAt?: Date;

  @Prop()
  lastFavoriteAt?: Date;

  @Prop()
  lastCompareAt?: Date;

  @Prop()
  lastHistoryAt?: Date;

  @Prop({ default: false })
  managerNotified: boolean;

  @Prop()
  managerNotifiedAt?: Date;

  // === AUTO-LEAD FIELDS ===
  @Prop()
  lastAutoLeadCreatedAt?: Date;

  @Prop()
  lastAutoLeadId?: string;

  @Prop({ default: 0 })
  autoLeadsCount: number;

  // === AUTO-CALL FIELDS ===
  @Prop()
  lastCallTriggeredAt?: Date;

  @Prop()
  lastCallSid?: string;

  @Prop({ default: 0 })
  callsTriggered: number;

  // === TELEGRAM FIELDS ===
  @Prop()
  lastTelegramNotifiedAt?: Date;

  @Prop({ default: 0 })
  telegramNotifications: number;

  // User context for leads (favorites, compares, last viewed VIN)
  @Prop({ type: Object, default: {} })
  context: {
    favoriteVins?: string[];
    compareVins?: string[];
    lastViewedVin?: string;
    email?: string;
    phone?: string;
    name?: string;
    telegramId?: string;
  };
}

export const IntentScoreSchema = SchemaFactory.createForClass(IntentScore);
IntentScoreSchema.index({ score: -1 });
IntentScoreSchema.index({ level: 1 });
IntentScoreSchema.index({ lastAutoLeadCreatedAt: 1 });
IntentScoreSchema.index({ lastCallTriggeredAt: 1 });
IntentScoreSchema.index({ lastTelegramNotifiedAt: 1 });
