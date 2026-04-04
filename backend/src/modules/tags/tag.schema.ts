import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';

@Schema({ timestamps: true })
export class Tag extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  color?: string;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const TagSchema = SchemaFactory.createForClass(Tag);
