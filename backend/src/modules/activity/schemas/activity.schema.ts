import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../../shared/utils';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../enums/activity-action.enum';

@Schema({ timestamps: true })
export class Activity extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  // Хто виконав дію
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userRole: string;

  @Prop()
  userName?: string;

  // Що саме зроблено
  @Prop({ type: String, enum: Object.values(ActivityAction), required: true, index: true })
  action: ActivityAction;

  // На яку сутність
  @Prop({ type: String, enum: Object.values(ActivityEntityType), index: true })
  entityType?: ActivityEntityType;

  @Prop({ index: true })
  entityId?: string;

  // Додаткові метадані
  @Prop({ type: Object })
  meta?: {
    fromStatus?: string;
    toStatus?: string;
    duration?: number;
    reason?: string;
    value?: number;
    assignedTo?: string;
    assignedFrom?: string;
    [key: string]: any;
  };

  // Контекст виконання
  @Prop({ type: Object })
  context?: {
    ip?: string;
    userAgent?: string;
    source?: ActivitySource;
    requestId?: string;
  };

  // Timestamps автоматично додаються через timestamps: true
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// Indexes для швидких запитів
ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
ActivitySchema.index({ action: 1, createdAt: -1 });
ActivitySchema.index({ createdAt: -1 });
ActivitySchema.index({ 'meta.assignedTo': 1, createdAt: -1 });
