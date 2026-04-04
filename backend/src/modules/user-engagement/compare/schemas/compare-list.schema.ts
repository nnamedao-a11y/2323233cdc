/**
 * Compare List Schema
 * 
 * Список порівняння авто (max 3)
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CompareListDocument = CompareList & Document;

@Schema({ _id: false })
export class CompareItem {
  @Prop({ required: true })
  vehicleId: string;

  @Prop({ required: true })
  vin: string;

  @Prop({ default: Date.now })
  addedAt: Date;

  @Prop({ type: Object, default: {} })
  snapshot?: Record<string, any>;
}

const CompareItemSchema = SchemaFactory.createForClass(CompareItem);

@Schema({ timestamps: true })
export class CompareList {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ type: [CompareItemSchema], default: [] })
  items: CompareItem[];
}

export const CompareListSchema = SchemaFactory.createForClass(CompareList);
