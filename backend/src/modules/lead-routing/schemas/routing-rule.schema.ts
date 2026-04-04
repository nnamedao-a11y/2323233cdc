import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../../shared/utils';
import { AssignmentStrategy } from '../enums/assignment.enum';

@Schema({ timestamps: true })
export class RoutingRule extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0, index: true })
  priority: number;

  // === SCOPE FILTERS ===
  @Prop()
  market?: string; // 'BG', 'EU', 'US'

  @Prop()
  language?: string; // 'uk', 'en', 'bg'

  @Prop()
  source?: string; // 'website', 'phone', 'ads', 'manual'

  @Prop()
  leadType?: string; // 'standard', 'vip', 'callback', 'missed_call'

  // === STRATEGY ===
  @Prop({ 
    type: String, 
    enum: Object.values(AssignmentStrategy), 
    default: AssignmentStrategy.LEAST_LOADED 
  })
  strategy: AssignmentStrategy;

  // === CAPACITY LIMITS ===
  @Prop({ type: Number })
  maxActiveLeadsPerManager?: number;

  @Prop({ type: Number })
  maxOpenTasksPerManager?: number;

  // === MANAGER FILTERS ===
  @Prop({ default: true })
  onlyAvailableManagers: boolean;

  @Prop({ type: [String], default: ['manager'] })
  allowedRoleKeys: string[]; // ['manager', 'admin']

  @Prop({ type: [String] })
  supportedMarkets?: string[];

  @Prop({ type: [String] })
  supportedLanguages?: string[];

  @Prop({ type: [String] })
  supportedSources?: string[];

  // === FALLBACK ===
  @Prop()
  fallbackManagerId?: string;

  @Prop({ default: false })
  useFallbackQueue: boolean;

  // === SLA ===
  @Prop({ type: Number, default: 10 })
  firstResponseSlaMinutes: number;

  // === METADATA ===
  @Prop({ required: true })
  createdBy: string;

  @Prop()
  updatedBy?: string;

  @Prop()
  deletedAt?: Date;
}

export const RoutingRuleSchema = SchemaFactory.createForClass(RoutingRule);

// Indexes for efficient rule lookup
RoutingRuleSchema.index({ isActive: 1, priority: -1 });
RoutingRuleSchema.index({ market: 1, language: 1, source: 1 });
RoutingRuleSchema.index({ leadType: 1, isActive: 1 });
