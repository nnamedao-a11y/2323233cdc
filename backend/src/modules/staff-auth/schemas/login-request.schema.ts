import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LoginRequestDocument = LoginRequest & Document;

@Schema({ timestamps: true, collection: 'login_requests' })
export class LoginRequest {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  role: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  ip: string;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ required: true })
  deviceId: string;

  @Prop({ default: 'pending', index: true })
  status: 'pending' | 'sms_verified' | 'approved' | 'denied' | 'expired';

  @Prop()
  smsCode?: string;

  @Prop()
  smsExpiresAt?: Date;

  @Prop()
  smsVerifiedAt?: Date;

  @Prop()
  approvedAt?: Date;

  @Prop()
  approvedByUserId?: string;

  @Prop()
  deniedAt?: Date;

  @Prop()
  denyReason?: string;

  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true })
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LoginRequestSchema = SchemaFactory.createForClass(LoginRequest);
LoginRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
