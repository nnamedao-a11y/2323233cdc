/**
 * Login Approval Request Schema
 * 
 * Tracks Team Lead login approval requests
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum LoginApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'login_approval_requests' })
export class LoginApprovalRequest extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop()
  userName: string;

  @Prop()
  userEmail: string;

  @Prop()
  userRole: string;

  @Prop({ type: String, enum: LoginApprovalStatus, default: LoginApprovalStatus.PENDING })
  status: LoginApprovalStatus;

  // Request context
  @Prop()
  ip: string;

  @Prop()
  userAgent: string;

  @Prop()
  device: string;

  @Prop()
  location: string;

  // Approval details
  @Prop()
  approvedBy: string;

  @Prop()
  approverName: string;

  @Prop()
  approvedAt: Date;

  @Prop()
  deniedAt: Date;

  @Prop()
  denyReason: string;

  // Expiry
  @Prop()
  expiresAt: Date;

  // Telegram approval
  @Prop()
  telegramMessageId: string;

  @Prop({ type: Object })
  meta: Record<string, any>;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const LoginApprovalRequestSchema = SchemaFactory.createForClass(LoginApprovalRequest);

LoginApprovalRequestSchema.index({ userId: 1 });
LoginApprovalRequestSchema.index({ status: 1 });
LoginApprovalRequestSchema.index({ expiresAt: 1 });
