import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerSessionDocument = CustomerSession & Document;

@Schema({ timestamps: true, collection: 'customer_sessions' })
export class CustomerSession {
  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true, unique: true, index: true })
  sessionToken: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const CustomerSessionSchema = SchemaFactory.createForClass(CustomerSession);

// Index for cleanup
CustomerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
