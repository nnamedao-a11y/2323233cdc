/**
 * Parser State Schema
 * 
 * Головна сутність для control center
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ParserStatus } from '../enums/parser-status.enum';

@Schema({ timestamps: true })
export class ParserState extends Document {
  @Prop({ required: true, unique: true })
  source: string; // copart, iaai

  @Prop({ required: true, default: ParserStatus.STOPPED, enum: ParserStatus })
  status: ParserStatus;

  @Prop()
  lastRunAt?: Date;

  @Prop()
  lastSuccessAt?: Date;

  @Prop()
  nextRunAt?: Date;

  @Prop()
  lastDurationMs?: number;

  @Prop({ default: 0 })
  itemsParsed: number;

  @Prop({ default: 0 })
  itemsCreated: number;

  @Prop({ default: 0 })
  itemsUpdated: number;

  @Prop({ default: 0 })
  errorsCount: number;

  @Prop({ default: 0 })
  consecutiveFailures: number;

  @Prop({ default: false })
  isPaused: boolean;

  @Prop()
  pauseReason?: string;

  @Prop({ type: Object })
  healthSnapshot?: {
    successRate?: number;
    circuitState?: string;
    activeProxyCount?: number;
    cooldownProxyCount?: number;
    lastError?: string;
  };

  @Prop()
  cronExpression?: string;

  @Prop()
  updatedBy?: string;
}

export const ParserStateSchema = SchemaFactory.createForClass(ParserState);

// Indexes
ParserStateSchema.index({ source: 1 });
ParserStateSchema.index({ status: 1 });
ParserStateSchema.index({ lastRunAt: -1 });
