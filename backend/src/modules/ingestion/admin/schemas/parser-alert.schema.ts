/**
 * Parser Alert Schema
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ParserAlertLevel, ParserAlertCode } from '../enums/parser-status.enum';
import { generateId } from '../../../../shared/utils';

@Schema({ timestamps: true })
export class ParserAlert extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true, enum: ParserAlertLevel })
  level: ParserAlertLevel;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ default: false })
  isResolved: boolean;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  resolvedBy?: string;

  @Prop({ type: Object })
  meta?: Record<string, any>;
}

export const ParserAlertSchema = SchemaFactory.createForClass(ParserAlert);

// Indexes
ParserAlertSchema.index({ source: 1, isResolved: 1 });
ParserAlertSchema.index({ level: 1, isResolved: 1 });
ParserAlertSchema.index({ createdAt: -1 });
ParserAlertSchema.index({ isResolved: 1 });
