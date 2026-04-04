import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomerSavedListingDocument = CustomerSavedListing & Document;

@Schema({ timestamps: true, collection: 'customersavedlistings' })
export class CustomerSavedListing {
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
}

export const CustomerSavedListingSchema = SchemaFactory.createForClass(CustomerSavedListing);
CustomerSavedListingSchema.index({ customerId: 1, listingId: 1 }, { unique: true });
