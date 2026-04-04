import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SecuritySettingsDocument = SecuritySettings & Document;

@Schema({ timestamps: true, collection: 'security_settings' })
export class SecuritySettings {
  @Prop({ default: 'singleton', unique: true })
  key: string;

  @Prop({ required: true })
  approvalEmail: string;

  @Prop({ default: true })
  requireOwnerApproval: boolean;

  @Prop({ default: true })
  smsRequired: boolean;

  @Prop({ default: 2 })
  sessionLimitPerUser: number;

  @Prop({ default: true })
  notifyOnLoginRequest: boolean;

  @Prop({ default: true })
  notifyOnNewDevice: boolean;

  @Prop({ default: 30 })
  inactivityTimeoutMinutes: number;

  @Prop({ default: 8 })
  sessionLifetimeHours: number;

  @Prop({ default: 5 })
  smsCodeExpiryMinutes: number;

  @Prop({ default: 10 })
  loginRequestExpiryMinutes: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SecuritySettingsSchema = SchemaFactory.createForClass(SecuritySettings);
