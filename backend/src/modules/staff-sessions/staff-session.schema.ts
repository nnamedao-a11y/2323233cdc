import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';

export enum SessionStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
  FORCED_LOGOUT = 'forced_logout',
  EXPIRED = 'expired',
  SUSPICIOUS = 'suspicious',
}

export enum TwoFactorMethod {
  TOTP = 'totp',          // Google Authenticator / Authy
  EMAIL = 'email',        // Email code
  SMS = 'sms',            // SMS code (backup)
}

@Schema({ timestamps: true })
export class StaffSession extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  role: string;

  @Prop()
  email: string;

  // === DEVICE INFO ===
  @Prop()
  deviceId?: string;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  country?: string;

  @Prop()
  city?: string;

  // === SESSION TIMING ===
  @Prop({ default: () => new Date() })
  startedAt: Date;

  @Prop()
  lastSeenAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ type: String, enum: SessionStatus, default: SessionStatus.ACTIVE })
  status: SessionStatus;

  // === 2FA ===
  @Prop({ default: false })
  twoFactorVerified: boolean;

  @Prop({ type: String, enum: TwoFactorMethod })
  twoFactorMethod?: TwoFactorMethod;

  // === OWNER APPROVAL (for strict mode) ===
  @Prop({ default: false })
  requiresOwnerApproval: boolean;

  @Prop()
  approvedByOwner?: string;

  @Prop()
  approvedAt?: Date;

  // === SUSPICIOUS FLAGS ===
  @Prop({ default: false })
  isNewDevice: boolean;

  @Prop({ default: false })
  isUnusualLocation: boolean;

  @Prop({ default: false })
  isSuspicious: boolean;

  @Prop()
  suspiciousReason?: string;

  // === SESSION TOKEN ===
  @Prop()
  refreshToken?: string;

  @Prop()
  tokenExpiresAt?: Date;

  // === ACTIVITY TRACKING ===
  @Prop({ type: Number, default: 0 })
  actionsCount: number;

  @Prop({ type: Number, default: 0 })
  idleMinutes: number;

  @Prop()
  endReason?: string;
}

export const StaffSessionSchema = SchemaFactory.createForClass(StaffSession);

StaffSessionSchema.index({ userId: 1, status: 1 });
StaffSessionSchema.index({ status: 1 });
StaffSessionSchema.index({ startedAt: -1 });
StaffSessionSchema.index({ lastSeenAt: -1 });
StaffSessionSchema.index({ ipAddress: 1 });
StaffSessionSchema.index({ deviceId: 1 });
