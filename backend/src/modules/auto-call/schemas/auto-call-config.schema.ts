/**
 * Auto-Call Configuration Schema
 * 
 * Зберігає налаштування автодзвінків з адмін панелі
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AutoCallConfigDocument = AutoCallConfig & Document;

@Schema({ timestamps: true })
export class AutoCallConfig {
  @Prop({ default: 'main' })
  configId: string;

  // Twilio Settings
  @Prop()
  twilioAccountSid?: string;

  @Prop()
  twilioAuthToken?: string;

  @Prop()
  twilioPhoneNumber?: string;

  // General Settings
  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: 3 * 60 * 60 * 1000 }) // 3 hours
  callCooldownMs: number;

  @Prop({ default: 30 * 60 * 1000 }) // 30 minutes
  notificationCooldownMs: number;

  @Prop({ default: 10 })
  hotIntentThreshold: number;

  // Manager Phone Numbers for Auto-call
  @Prop({ type: [String], default: [] })
  managerPhones: string[];

  // Default Voice Message Template
  @Prop({ default: 'HOT клієнт чекає дзвінка. Останнє VIN: {vin}. Score: {score}. Терміново зв\'яжіться!' })
  voiceMessageTemplate: string;

  // Working Hours (optional)
  @Prop({ type: Object, default: { start: '09:00', end: '21:00' } })
  workingHours: { start: string; end: string };

  @Prop({ default: 'Europe/Kyiv' })
  timezone: string;

  // Stats
  @Prop({ default: 0 })
  totalCallsInitiated: number;

  @Prop({ default: 0 })
  totalCallsAnswered: number;

  @Prop()
  lastCallAt?: Date;
}

export const AutoCallConfigSchema = SchemaFactory.createForClass(AutoCallConfig);
AutoCallConfigSchema.index({ configId: 1 }, { unique: true });
