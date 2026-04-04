import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ResponseTimeDocument = ResponseTime & Document;

@Schema({ timestamps: true, collection: 'response_times' })
export class ResponseTime {
  @Prop({ required: true, index: true })
  managerId: string;

  @Prop({ required: true, index: true })
  leadId: string;

  @Prop()
  dealId?: string;

  @Prop({ required: true, enum: ['lead_assigned', 'first_call', 'first_message', 'callback'] })
  eventType: string;

  @Prop({ required: true })
  triggerTime: Date; // When the event was triggered (lead assigned, etc.)

  @Prop()
  responseTime?: Date; // When manager responded

  @Prop()
  responseSeconds?: number; // Calculated response time in seconds

  @Prop()
  isWithinSLA?: boolean; // Whether response was within SLA

  @Prop({ default: 300 }) // Default 5 minutes SLA
  slaSeconds: number;

  @Prop({ default: false })
  isResolved: boolean;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const ResponseTimeSchema = SchemaFactory.createForClass(ResponseTime);

// Indexes for fast queries
ResponseTimeSchema.index({ managerId: 1, createdAt: -1 });
ResponseTimeSchema.index({ eventType: 1, createdAt: -1 });
ResponseTimeSchema.index({ isWithinSLA: 1, createdAt: -1 });
