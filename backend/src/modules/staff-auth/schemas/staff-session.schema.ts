import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StaffSessionDocument = StaffSession & Document;

@Schema({ timestamps: true, collection: 'staff_sessions' })
export class StaffSession {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  role: string;

  @Prop()
  teamLeadId?: string;

  @Prop({ required: true })
  ip: string;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ required: true, index: true })
  deviceId: string;

  @Prop()
  deviceName?: string;

  @Prop({ required: true, unique: true, index: true })
  sessionToken: string;

  @Prop({ default: 'active', index: true })
  status: 'active' | 'terminated' | 'expired';

  @Prop()
  lastSeenAt?: Date;

  @Prop()
  terminatedAt?: Date;

  @Prop()
  terminatedByUserId?: string;

  @Prop()
  terminateReason?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  approvedByUserId?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StaffSessionSchema = SchemaFactory.createForClass(StaffSession);
StaffSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StaffSessionSchema.index({ userId: 1, status: 1 });
