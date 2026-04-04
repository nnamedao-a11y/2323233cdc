import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';

const TaskStatusValues = ['todo', 'in_progress', 'completed', 'cancelled', 'overdue'];
const TaskPriorityValues = ['low', 'medium', 'high', 'urgent'];
const EntityTypeValues = ['user', 'lead', 'customer', 'deal', 'deposit', 'task', 'note', 'file', 'document'];

@Schema({ timestamps: true })
export class Task extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: TaskStatusValues, default: 'todo' })
  status: string;

  @Prop({ type: String, enum: TaskPriorityValues, default: 'medium' })
  priority: string;

  @Prop()
  dueDate?: Date;

  @Prop()
  assignedTo?: string;

  @Prop({ type: String, enum: EntityTypeValues })
  relatedEntityType?: string;

  @Prop()
  relatedEntityId?: string;

  @Prop({ default: false })
  isReminder: boolean;

  @Prop()
  reminderDate?: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  createdBy: string;

  @Prop()
  completedAt?: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ assignedTo: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ dueDate: 1 });
TaskSchema.index({ relatedEntityType: 1, relatedEntityId: 1 });
