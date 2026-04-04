/**
 * Route Rate Schema
 * 
 * Таблиця ставок доставки по маршрутах та типах авто
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RouteRateDocument = RouteRate & Document;

@Schema({ timestamps: true })
export class RouteRate {
  @Prop({ required: true })
  profileCode: string;

  @Prop({ required: true, enum: ['usa_inland', 'ocean', 'eu_delivery'] })
  rateType: 'usa_inland' | 'ocean' | 'eu_delivery';

  @Prop()
  originCode?: string; // NJ, GA, TX, CA (for USA routes)

  @Prop()
  destinationCode?: string; // BG, UA (for EU delivery)

  @Prop({ required: true, enum: ['sedan', 'suv', 'bigSUV', 'pickup'] })
  vehicleType: 'sedan' | 'suv' | 'bigSUV' | 'pickup';

  @Prop({ required: true })
  amount: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  notes?: string;
}

export const RouteRateSchema = SchemaFactory.createForClass(RouteRate);

// Compound index for quick lookups
RouteRateSchema.index({ 
  profileCode: 1, 
  rateType: 1, 
  originCode: 1, 
  destinationCode: 1, 
  vehicleType: 1 
});
