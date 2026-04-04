import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AutomationTrigger, AutomationAction } from '../../../shared/enums';
import { generateId } from '../../../shared/utils';

@Schema({ timestamps: true })
export class AutomationLog extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  ruleId: string;

  @Prop({ required: true })
  ruleName: string;

  @Prop({ type: String, enum: Object.values(AutomationTrigger), required: true })
  trigger: AutomationTrigger;

  @Prop({ required: true })
  entityType: string;

  @Prop({ required: true })
  entityId: string;

  @Prop({ type: [{ action: String, status: String, result: Object }] })
  actionsExecuted: Array<{
    action: AutomationAction;
    status: 'success' | 'failed' | 'skipped';
    result?: Record<string, any>;
    error?: string;
  }>;

  @Prop({ default: 'completed' })
  status: 'pending' | 'running' | 'completed' | 'failed';

  @Prop()
  error?: string;

  @Prop()
  executedAt: Date;
}

export const AutomationLogSchema = SchemaFactory.createForClass(AutomationLog);
AutomationLogSchema.index({ ruleId: 1 });
AutomationLogSchema.index({ entityType: 1, entityId: 1 });
AutomationLogSchema.index({ createdAt: -1 });
