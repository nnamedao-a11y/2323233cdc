import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DepositStatus } from '../../shared/enums';
import { generateId } from '../../shared/utils';

@Schema({ timestamps: true })
export class Deposit extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  customerId: string;

  @Prop()
  dealId?: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, enum: DepositStatus, default: DepositStatus.PENDING })
  status: DepositStatus;

  @Prop()
  description?: string;

  @Prop()
  paymentMethod?: string;

  @Prop({ type: [String], default: [] })
  proofFiles: string[];

  @Prop()
  approvedBy?: string;

  @Prop()
  approvedAt?: Date;

  @Prop()
  confirmedAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  createdBy: string;
}

export const DepositSchema = SchemaFactory.createForClass(Deposit);

DepositSchema.index({ customerId: 1 });
DepositSchema.index({ dealId: 1 });
DepositSchema.index({ status: 1 });
