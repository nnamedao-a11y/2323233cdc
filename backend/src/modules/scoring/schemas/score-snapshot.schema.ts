/**
 * BIBI Cars - Score Snapshot Schema
 * Persistent storage for entity scores
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ScoreSnapshotDocument = ScoreSnapshot & Document;

export type ScoreType = 'lead_score' | 'deal_health' | 'manager_performance' | 'shipment_risk';
export type ScoreBand = 'cold' | 'warm' | 'hot' | 'low' | 'medium' | 'high' | 'critical';

export interface ScoreFactor {
  key: string;
  points: number;
  description?: string;
  timestamp?: Date;
}

@Schema({ timestamps: true, collection: 'score_snapshots' })
export class ScoreSnapshot {
  @Prop({ required: true, index: true })
  entityType: 'lead' | 'deal' | 'manager' | 'shipment';

  @Prop({ required: true, index: true })
  entityId: string;

  @Prop({ required: true, index: true })
  scoreType: ScoreType;

  @Prop({ required: true, default: 0 })
  value: number;

  @Prop({ required: true, default: 'low' })
  band: ScoreBand;

  @Prop({ type: [Object], default: [] })
  factors: ScoreFactor[];

  @Prop({ type: Object, default: {} })
  meta: Record<string, any>;

  @Prop()
  lastCalculatedAt: Date;
}

export const ScoreSnapshotSchema = SchemaFactory.createForClass(ScoreSnapshot);

// Compound index for quick lookups
ScoreSnapshotSchema.index({ entityType: 1, entityId: 1, scoreType: 1 }, { unique: true });
ScoreSnapshotSchema.index({ scoreType: 1, band: 1 });
ScoreSnapshotSchema.index({ value: -1 });
