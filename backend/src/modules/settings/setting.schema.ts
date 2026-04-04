import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';

@Schema({ timestamps: true })
export class Setting extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: Object })
  value: any;

  @Prop()
  description?: string;

  @Prop({ default: false })
  sensitive?: boolean;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
