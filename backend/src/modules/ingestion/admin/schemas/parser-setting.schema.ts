/**
 * Parser Setting Schema
 * 
 * Зберігаємо все, що адмін повинен міняти з UI
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class ParserSetting extends Document {
  @Prop({ required: true, unique: true })
  source: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: '0 */4 * * *' })
  cronExpression: string;

  @Prop({ default: 30000 })
  timeoutMs: number;

  @Prop({ default: 3 })
  maxRetries: number;

  @Prop({ default: true })
  useProxies: boolean;

  @Prop({ default: true })
  useFingerprint: boolean;

  @Prop({ default: true })
  useCircuitBreaker: boolean;

  @Prop({ default: 5 })
  maxPages: number;

  @Prop({ default: 3 })
  scrollCount: number;

  @Prop({ default: 2000 })
  waitTimeMs: number;

  @Prop({ default: false })
  autoRestartOnFailure: boolean;

  @Prop({ default: 3 })
  autoRestartFailureThreshold: number;

  @Prop({ default: true })
  saveRawPayloads: boolean;

  @Prop({ default: true })
  enableAlerts: boolean;

  @Prop()
  updatedBy?: string;
}

export const ParserSettingSchema = SchemaFactory.createForClass(ParserSetting);

// Indexes
ParserSettingSchema.index({ source: 1 });
