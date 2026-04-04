import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../../shared/utils';

@Schema({ timestamps: true })
export class CallbackQueue extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, index: true })
  leadId: string;

  @Prop()
  customerId?: string;

  @Prop({ required: true, index: true })
  assignedTo: string;

  @Prop({ required: true })
  scheduledAt: Date;

  // SLA tracking
  @Prop()
  slaDeadline?: Date;

  @Prop()
  slaBreachedAt?: Date;

  @Prop({ type: Number, default: 0 })
  slaBreachLevel: number;

  @Prop({ default: 0 })
  attemptNumber: number;

  @Prop({ default: 'pending', index: true })
  status: 'pending' | 'in_progress' | 'completed' | 'missed' | 'cancelled' | 'escalated';

  @Prop()
  completedAt?: Date;

  @Prop()
  escalatedTo?: string;

  @Prop()
  escalatedAt?: Date;

  @Prop()
  notes?: string;

  @Prop({ type: Number, default: 1 })
  priority: number;

  // Причина якщо missed/cancelled
  @Prop()
  reason?: string;
}

export const CallbackQueueSchema = SchemaFactory.createForClass(CallbackQueue);
CallbackQueueSchema.index({ assignedTo: 1, status: 1, scheduledAt: 1 });
CallbackQueueSchema.index({ leadId: 1 });
CallbackQueueSchema.index({ status: 1, scheduledAt: 1 }); // для SLA checks
CallbackQueueSchema.index({ slaBreachLevel: 1, status: 1 }); // для breach queries
