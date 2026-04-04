/**
 * Calculator Profile Schema
 * 
 * Активний профіль калькулятора з базовими налаштуваннями
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CalculatorProfileDocument = CalculatorProfile & Document;

@Schema({ timestamps: true })
export class CalculatorProfile {
  @Prop({ required: true, unique: true })
  code: string; // default-bg

  @Prop({ required: true })
  name: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 'BG' })
  destinationCountry: string;

  @Prop({ default: 'USD' })
  currency: string;

  // Insurance rate (% of car price + auction fee)
  @Prop({ default: 0.02 })
  insuranceRate: number;

  // Fixed fees
  @Prop({ default: 150 })
  usaHandlingFee: number;

  @Prop({ default: 100 })
  bankFee: number;

  @Prop({ default: 600 })
  euPortHandlingFee: number;

  @Prop({ default: 940 })
  companyFee: number;

  // Customs rate (% of car price)
  @Prop({ default: 0.1 })
  customsRate: number;

  // Hidden fee (internal margin)
  @Prop({ default: 700 })
  hiddenFeeUnder5000: number;

  @Prop({ default: 1400 })
  hiddenFeeOver5000: number;

  @Prop({ default: 5000 })
  hiddenFeeThreshold: number;

  // Documentation fees
  @Prop({ default: 50 })
  documentationFee: number;

  // Title processing
  @Prop({ default: 75 })
  titleFee: number;
}

export const CalculatorProfileSchema = SchemaFactory.createForClass(CalculatorProfile);
