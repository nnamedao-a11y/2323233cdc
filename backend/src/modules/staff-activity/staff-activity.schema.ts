import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';

export enum ActivityType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  LEAD_VIEWED = 'lead_viewed',
  LEAD_UPDATED = 'lead_updated',
  CALL_ATTEMPTED = 'call_attempted',
  CALL_COMPLETED = 'call_completed',
  NOTE_ADDED = 'note_added',
  TASK_COMPLETED = 'task_completed',
  TASK_CREATED = 'task_created',
  DEAL_CREATED = 'deal_created',
  DEAL_CLOSED = 'deal_closed',
  REPORT_APPROVED = 'report_approved',
  REPORT_DENIED = 'report_denied',
  REMINDER_COMPLETED = 'reminder_completed',
  REMINDER_MISSED = 'reminder_missed',
  IDLE_TIMEOUT = 'idle_timeout',
  SESSION_RESUMED = 'session_resumed',
}

@Schema({ timestamps: true })
export class StaffActivity extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop()
  sessionId?: string;

  @Prop({ type: String, enum: ActivityType, required: true })
  type: ActivityType;

  // === CONTEXT ===
  @Prop()
  entityType?: string;  // lead, deal, task, etc.

  @Prop()
  entityId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // === TIMING ===
  @Prop()
  duration?: number;  // For calls, etc.

  // === LOCATION ===
  @Prop()
  ipAddress?: string;

  // Timestamps (managed by Mongoose)
  createdAt?: Date;
  updatedAt?: Date;
}

export const StaffActivitySchema = SchemaFactory.createForClass(StaffActivity);

StaffActivitySchema.index({ userId: 1, createdAt: -1 });
StaffActivitySchema.index({ type: 1, createdAt: -1 });
StaffActivitySchema.index({ sessionId: 1 });
StaffActivitySchema.index({ createdAt: -1 });
