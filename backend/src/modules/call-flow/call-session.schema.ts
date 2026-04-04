import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';

export enum CallSessionStatus {
  NEW = 'new',
  CALLED_NO_ANSWER = 'no_answer',
  CALLBACK_REQUESTED = 'callback_requested',
  INTERESTED = 'interested',
  THINKING = 'thinking',
  NEGOTIATION = 'negotiation',
  NOT_INTERESTED = 'not_interested',
  WRONG_NUMBER = 'wrong_number',
  DEAL = 'deal',
}

export enum NextActionType {
  CALL = 'call',
  SMS = 'sms',
  EMAIL = 'email',
  FOLLOW_UP = 'follow_up',
  CLOSE = 'close',
  NONE = 'none',
}

@Schema({ timestamps: true })
export class CallSession extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, index: true })
  leadId: string;

  @Prop({ required: true, index: true })
  managerId: string;

  @Prop({ type: String, enum: CallSessionStatus, default: CallSessionStatus.NEW })
  status: CallSessionStatus;

  @Prop()
  notes?: string;

  // Structured notes
  @Prop({ type: Object })
  structuredNotes?: {
    objection?: string;
    budget?: number;
    interestLevel?: 'high' | 'medium' | 'low';
    nextStep?: string;
    clientComment?: string;
  };

  // Next action scheduling
  @Prop({ type: Date, index: true })
  nextActionAt?: Date;

  @Prop({ type: String, enum: NextActionType, default: NextActionType.CALL })
  nextActionType: NextActionType;

  // Call attempts tracking
  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop()
  lastCallAt?: Date;

  // Duration tracking
  @Prop({ type: Number })
  lastCallDuration?: number; // seconds

  @Prop({ type: Number, default: 0 })
  totalCallDuration: number;

  // Outcome tracking
  @Prop()
  closedAt?: Date;

  @Prop()
  closedReason?: string;
}

export const CallSessionSchema = SchemaFactory.createForClass(CallSession);

CallSessionSchema.index({ status: 1 });
CallSessionSchema.index({ nextActionAt: 1 });
CallSessionSchema.index({ managerId: 1, status: 1 });
CallSessionSchema.index({ leadId: 1 });
