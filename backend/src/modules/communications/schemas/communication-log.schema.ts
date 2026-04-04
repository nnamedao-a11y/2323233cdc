import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CommunicationChannel } from '../../../shared/enums';
import { generateId } from '../../../shared/utils';

@Schema({ timestamps: true })
export class CommunicationLog extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ type: String, enum: Object.values(CommunicationChannel), required: true })
  channel: CommunicationChannel;

  @Prop({ required: true })
  recipientId: string; // lead or customer ID

  @Prop()
  recipientEmail?: string;

  @Prop()
  recipientPhone?: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  templateId?: string;

  @Prop({ type: String, enum: ['pending', 'sent', 'delivered', 'failed', 'bounced'], default: 'pending' })
  status: string;

  @Prop()
  externalId?: string; // ID from email/SMS provider

  @Prop()
  sentAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop()
  sentBy: string; // user ID or 'system'
}

export const CommunicationLogSchema = SchemaFactory.createForClass(CommunicationLog);
CommunicationLogSchema.index({ recipientId: 1 });
CommunicationLogSchema.index({ channel: 1 });
CommunicationLogSchema.index({ status: 1 });
CommunicationLogSchema.index({ createdAt: -1 });
