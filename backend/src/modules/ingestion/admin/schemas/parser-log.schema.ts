/**
 * Parser Log Schema
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ParserLogLevel, ParserLogEvent } from '../enums/parser-status.enum';
import { generateId } from '../../../../shared/utils';

@Schema({ timestamps: true })
export class ParserLog extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true, enum: ParserLogLevel })
  level: ParserLogLevel;

  @Prop({ required: true })
  event: string;

  @Prop()
  message?: string;

  @Prop()
  proxyId?: string;

  @Prop()
  proxyServer?: string;

  @Prop()
  externalId?: string;

  @Prop()
  vin?: string;

  @Prop()
  durationMs?: number;

  @Prop({ type: Object })
  meta?: Record<string, any>;
}

export const ParserLogSchema = SchemaFactory.createForClass(ParserLog);

// Indexes
ParserLogSchema.index({ source: 1, createdAt: -1 });
ParserLogSchema.index({ level: 1, createdAt: -1 });
ParserLogSchema.index({ event: 1 });
ParserLogSchema.index({ createdAt: -1 });

// TTL index - автоматичне видалення логів старших 30 днів
ParserLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
