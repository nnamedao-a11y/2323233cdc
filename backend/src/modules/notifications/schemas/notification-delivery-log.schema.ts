import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDeliveryLogDocument = NotificationDeliveryLog & Document;

@Schema({ timestamps: true })
export class NotificationDeliveryLog {
  @Prop({ required: true, index: true })
  notificationId: string;

  @Prop({ required: true, enum: ['inApp', 'telegram', 'email', 'sound'] })
  channel: 'inApp' | 'telegram' | 'email' | 'sound';

  @Prop({ required: true, index: true })
  target: string;

  @Prop({ default: 'success', enum: ['success', 'failed', 'skipped'] })
  status: 'success' | 'failed' | 'skipped';

  @Prop()
  error?: string;

  @Prop()
  deliveredAt?: Date;
}

export const NotificationDeliveryLogSchema = SchemaFactory.createForClass(NotificationDeliveryLog);

NotificationDeliveryLogSchema.index({ notificationId: 1, channel: 1 });
