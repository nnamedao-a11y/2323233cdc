/**
 * BIBI Cars - Journey Snapshot Schema
 * Aggregated journey state per entity
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type JourneySnapshotDocument = JourneySnapshot & Document;

@Schema({ timestamps: true, collection: 'journey_snapshots' })
export class JourneySnapshot {
  @Prop({ required: true, index: true })
  entityType: 'lead' | 'deal' | 'shipment' | 'customer';

  @Prop({ required: true, index: true })
  entityId: string;

  @Prop()
  currentStage?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  lastEventAt?: Date;

  @Prop({ type: [String], default: [] })
  completedStages: string[];

  @Prop({ default: 0 })
  eventCount: number;

  @Prop({ type: Object, default: {} })
  metrics: {
    leadCreated?: boolean;
    firstContactAt?: Date;
    contactCount?: number;
    dealCreated?: boolean;
    contractSigned?: boolean;
    paymentCount?: number;
    totalPaid?: number;
    shipmentCreated?: boolean;
    delivered?: boolean;
    deliveredAt?: Date;
    daysToContact?: number;
    daysToDeal?: number;
    daysToContract?: number;
    daysToPayment?: number;
    daysToDelivery?: number;
    totalJourneyDays?: number;
  };

  @Prop({ type: [String], default: [] })
  touchpoints: string[];
}

export const JourneySnapshotSchema = SchemaFactory.createForClass(JourneySnapshot);

JourneySnapshotSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
JourneySnapshotSchema.index({ currentStage: 1 });
