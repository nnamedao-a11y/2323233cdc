import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AutomationTrigger, AutomationAction } from '../../../shared/enums';
import { generateId } from '../../../shared/utils';

@Schema({ timestamps: true })
export class AutomationRule extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: Object.values(AutomationTrigger), required: true })
  trigger: AutomationTrigger;

  @Prop({ type: Object })
  triggerConditions?: Record<string, any>;

  @Prop({ type: [{ 
    action: { type: String, enum: Object.values(AutomationAction) },
    params: { type: Object }
  }], required: true })
  actions: Array<{
    action: AutomationAction;
    params: Record<string, any>;
  }>;

  @Prop({ type: Number, default: 0 })
  delayMinutes: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  priority: number;

  @Prop({ type: Number, default: 0 })
  executionCount: number;

  @Prop()
  lastExecutedAt?: Date;
}

export const AutomationRuleSchema = SchemaFactory.createForClass(AutomationRule);
AutomationRuleSchema.index({ trigger: 1, isActive: 1 });
