/**
 * Session Schema
 * 
 * Tracks all user sessions for security and control
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SessionDocument = Session & Document;

@Schema({ timestamps: true, collection: 'sessions' })
export class Session {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  role: string;

  @Prop()
  email: string;

  @Prop()
  fullName: string;

  @Prop({ index: true })
  ip: string;

  @Prop()
  device: string;

  @Prop()
  userAgent: string;

  @Prop()
  browser: string;

  @Prop()
  os: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop()
  lastActivityAt: Date;

  @Prop()
  expiresAt: Date;

  @Prop({ default: false })
  isSuspicious: boolean;

  @Prop()
  suspiciousReason: string;

  @Prop()
  terminatedAt: Date;

  @Prop()
  terminatedBy: string;

  @Prop()
  terminationReason: string;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// Indexes
SessionSchema.index({ createdAt: -1 });
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ role: 1, isActive: 1 });
SessionSchema.index({ ip: 1 });
