import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../../shared/utils';
import { AssignmentStrategy, AssignmentTrigger } from '../enums/assignment.enum';

@Schema({ timestamps: true })
export class AssignmentHistory extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, index: true })
  leadId: string;

  @Prop()
  previousManagerId?: string;

  @Prop()
  newManagerId?: string;

  @Prop({ 
    type: String, 
    enum: Object.values(AssignmentStrategy), 
    required: true 
  })
  strategy: AssignmentStrategy;

  @Prop({ required: true })
  reason: string;

  @Prop({ 
    type: String, 
    enum: Object.values(AssignmentTrigger), 
    default: AssignmentTrigger.SYSTEM 
  })
  triggeredBy: AssignmentTrigger;

  @Prop()
  triggeredByUserId?: string;

  // Lead snapshot at assignment time
  @Prop({ type: Object })
  leadSnapshot?: {
    market?: string;
    language?: string;
    source?: string;
    leadType?: string;
    priority?: string;
    status?: string;
    contactStatus?: string;
  };

  // Manager workload snapshot
  @Prop({ type: Object })
  managerLoadSnapshot?: {
    previousManagerActiveLeads?: number;
    newManagerActiveLeads?: number;
    newManagerOpenTasks?: number;
    newManagerOverdueTasks?: number;
  };

  // Additional metadata
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // For fallback queue items
  @Prop({ default: false })
  isFallbackQueue: boolean;

  @Prop()
  fallbackResolvedAt?: Date;

  @Prop()
  fallbackResolvedBy?: string;
}

export const AssignmentHistorySchema = SchemaFactory.createForClass(AssignmentHistory);

// Indexes
AssignmentHistorySchema.index({ leadId: 1, createdAt: -1 });
AssignmentHistorySchema.index({ newManagerId: 1, createdAt: -1 });
AssignmentHistorySchema.index({ strategy: 1, createdAt: -1 });
AssignmentHistorySchema.index({ isFallbackQueue: 1, fallbackResolvedAt: 1 });
