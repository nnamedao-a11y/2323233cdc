import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerAccessDocument = CustomerAccess & Document;

/**
 * Customer Access Schema
 * 
 * Окрема аутентифікація для клієнтського кабінету
 * Прив'язана до Customer entity
 */

@Schema({ timestamps: true, collection: 'customeraccess' })
export class CustomerAccess {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop()
  verificationToken?: string;

  @Prop()
  resetToken?: string;

  @Prop()
  resetTokenExpires?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;

  @Prop({ default: 0 })
  loginCount: number;

  @Prop({ type: Object })
  preferences?: {
    language?: string;
    notifications?: boolean;
    emailUpdates?: boolean;
  };
}

export const CustomerAccessSchema = SchemaFactory.createForClass(CustomerAccess);

CustomerAccessSchema.index({ email: 1 });
CustomerAccessSchema.index({ customerId: 1 });
