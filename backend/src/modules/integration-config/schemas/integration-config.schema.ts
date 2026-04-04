/**
 * Integration Config Schema
 * 
 * Зберігає всі налаштування зовнішніх інтеграцій
 * Ключі шифруються перед збереженням
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IntegrationConfigDocument = IntegrationConfig & Document;

export enum IntegrationProvider {
  STRIPE = 'stripe',
  DOCUSIGN = 'docusign',
  RINGOSTAT = 'ringostat',
  TELEGRAM = 'telegram',
  VIBER = 'viber',
  TWILIO = 'twilio',
  EMAIL = 'email',
  SHIPPING = 'shipping',
  OPENAI = 'openai',
  WHATSAPP = 'whatsapp',
  SEARATES = 'searates',
  SHIPSGO = 'shipsgo',
  // New providers
  META_ADS = 'meta_ads',
  FACEBOOK_CAPI = 'facebook_capi',
  ONE_C = 'one_c',
  PNA = 'pna',
  CONTRACT_TEMPLATE = 'contract_template',
  // History report providers
  CAR_VERTICAL = 'car_vertical',
  CARFAX = 'carfax',
}

export enum IntegrationMode {
  SANDBOX = 'sandbox',
  LIVE = 'live',
  DISABLED = 'disabled',
}

export enum HealthStatus {
  OK = 'ok',
  DEGRADED = 'degraded',
  FAILED = 'failed',
  UNKNOWN = 'unknown',
  NOT_CONFIGURED = 'not_configured',
}

@Schema({ timestamps: true, collection: 'integration_configs' })
export class IntegrationConfig {
  @Prop({ required: true, unique: true, enum: IntegrationProvider })
  provider: IntegrationProvider;

  @Prop({ type: Object, default: {} })
  credentials: Record<string, string>; // Encrypted values

  @Prop({ type: Object, default: {} })
  settings: Record<string, any>; // Non-sensitive settings

  @Prop({ enum: IntegrationMode, default: IntegrationMode.DISABLED })
  mode: IntegrationMode;

  @Prop({ default: false })
  isEnabled: boolean;

  @Prop({ enum: HealthStatus, default: HealthStatus.UNKNOWN })
  healthStatus: HealthStatus;

  @Prop()
  lastHealthcheckAt?: Date;

  @Prop()
  lastHealthcheckError?: string;

  @Prop()
  lastSuccessfulCallAt?: Date;

  @Prop({ default: 0 })
  failedCallsCount: number;

  @Prop()
  updatedBy?: string;

  @Prop()
  webhookUrl?: string;

  @Prop()
  webhookSecret?: string; // Encrypted

  @Prop({ type: [String], default: [] })
  enabledEvents: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const IntegrationConfigSchema = SchemaFactory.createForClass(IntegrationConfig);

// Indexes
IntegrationConfigSchema.index({ provider: 1 }, { unique: true });
IntegrationConfigSchema.index({ isEnabled: 1 });
IntegrationConfigSchema.index({ healthStatus: 1 });
