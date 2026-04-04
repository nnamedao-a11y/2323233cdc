/**
 * BIBI Cars - Escalation Rule Schema
 * 
 * Defines escalation timeout and routing rules per event type
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EscalationRuleDocument = EscalationRule & Document;

@Schema({ timestamps: true })
export class EscalationRule {
  @Prop({ required: true, unique: true, index: true })
  eventType: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 30 })
  managerTimeoutMinutes: number;

  @Prop({ default: 60 })
  teamLeadTimeoutMinutes: number;

  @Prop({ default: true })
  escalateToTeamLead: boolean;

  @Prop({ default: true })
  escalateToOwner: boolean;

  @Prop({ default: 'critical' })
  severity: 'info' | 'warning' | 'critical';

  @Prop({ default: true })
  createTaskOnEscalation: boolean;

  @Prop({ type: [String], default: [] })
  notifyChannels: string[]; // ['telegram', 'inApp', 'sound']
}

export const EscalationRuleSchema = SchemaFactory.createForClass(EscalationRule);

// Indexes
EscalationRuleSchema.index({ isActive: 1 });
