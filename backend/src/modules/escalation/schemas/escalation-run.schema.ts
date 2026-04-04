import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EscalationRunDocument = EscalationRun & Document;

@Schema({ timestamps: true })
export class EscalationRun {
  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ required: true, index: true })
  entityType: string;

  @Prop({ required: true, index: true })
  entityId: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  managerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  teamLeadId?: Types.ObjectId;

  @Prop({ default: 'manager_pending', index: true })
  status: 'manager_pending' | 'teamlead_pending' | 'owner_pending' | 'resolved' | 'cancelled';

  @Prop({ default: 0 })
  escalationLevel: number;

  @Prop({ type: Date, index: true })
  managerDeadlineAt?: Date;

  @Prop({ type: Date, index: true })
  teamLeadDeadlineAt?: Date;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedByUserId?: Types.ObjectId;

  @Prop()
  resolvedReason?: string;

  @Prop({ type: Object, default: {} })
  meta: Record<string, any>;
}

export const EscalationRunSchema = SchemaFactory.createForClass(EscalationRun);
EscalationRunSchema.index({ eventType: 1, entityId: 1, status: 1 });
