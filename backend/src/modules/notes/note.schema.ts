import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EntityType } from '../../shared/enums';
import { generateId } from '../../shared/utils';

@Schema({ timestamps: true })
export class Note extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: String, enum: EntityType, required: true })
  entityType: EntityType;

  @Prop({ required: true })
  entityId: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  createdBy: string;
}

export const NoteSchema = SchemaFactory.createForClass(Note);
NoteSchema.index({ entityType: 1, entityId: 1 });
