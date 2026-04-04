import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SoundConfigDocument = SoundConfig & Document;

@Schema({ timestamps: true })
export class SoundConfig {
  @Prop({ required: true, unique: true, index: true })
  eventType: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ required: true })
  soundKey: string; // lead, payment, shipment, alert, custom_x

  @Prop()
  fileUrl?: string;

  @Prop({ default: 'default', enum: ['default', 'fun', 'custom'] })
  mode: 'default' | 'fun' | 'custom';
}

export const SoundConfigSchema = SchemaFactory.createForClass(SoundConfig);
