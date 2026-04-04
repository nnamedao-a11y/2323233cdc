import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ContactStatus, CallResult, CommunicationChannel } from '../../../shared/enums';
import { generateId } from '../../../shared/utils';

@Schema({ timestamps: true })
export class CallLog extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  leadId: string;

  @Prop()
  customerId?: string;

  @Prop({ required: true })
  managerId: string;

  @Prop({ type: String, enum: Object.values(CommunicationChannel), default: 'phone' })
  channel: CommunicationChannel;

  @Prop({ type: String, enum: Object.values(CallResult), required: true })
  result: CallResult;

  @Prop()
  duration?: number; // seconds

  @Prop()
  notes?: string;

  @Prop()
  nextFollowUpDate?: Date;

  @Prop({ type: String, enum: Object.values(ContactStatus) })
  newContactStatus?: ContactStatus;
}

export const CallLogSchema = SchemaFactory.createForClass(CallLog);
CallLogSchema.index({ leadId: 1 });
CallLogSchema.index({ customerId: 1 });
CallLogSchema.index({ managerId: 1 });
CallLogSchema.index({ createdAt: -1 });
