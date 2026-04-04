import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerRecentlyViewedDocument = CustomerRecentlyViewed & Document;

@Schema({ timestamps: true, collection: 'customerrecentlyviewed' })
export class CustomerRecentlyViewed {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true, index: true })
  listingId: string;

  @Prop({ default: '' })
  vin: string;

  @Prop()
  slug?: string;

  @Prop()
  viewedAt?: Date;
}

export const CustomerRecentlyViewedSchema = SchemaFactory.createForClass(CustomerRecentlyViewed);
CustomerRecentlyViewedSchema.index({ customerId: 1, listingId: 1 }, { unique: true });
CustomerRecentlyViewedSchema.index({ customerId: 1, viewedAt: -1 });
