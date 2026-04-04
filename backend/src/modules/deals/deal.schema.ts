import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';
import { DealStage } from '../blueprint/blueprint-stage.enum';

/**
 * Deal Schema v3.0 - Blueprint-Integrated Sales Pipeline
 * 
 * Pipeline controlled by Blueprint Engine:
 * NEW_LEAD → CONTACT_ATTEMPT → QUALIFIED → CAR_SELECTED → NEGOTIATION
 * → CONTRACT_SENT → CONTRACT_SIGNED → PAYMENT_PENDING → PAYMENT_DONE
 * → SHIPPING → DELIVERED
 * 
 * All stage changes MUST go through BlueprintService
 */

@Schema({ timestamps: true })
export class Deal extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  customerId?: string;

  // ============ BLUEPRINT STAGE (PRIMARY) ============
  @Prop({ 
    type: String, 
    enum: Object.values(DealStage), 
    default: DealStage.NEW_LEAD,
    index: true 
  })
  stage: DealStage;

  // Legacy status for backwards compatibility
  @Prop({ 
    type: String, 
    enum: ['new', 'negotiation', 'waiting_deposit', 'deposit_paid', 'purchased', 'in_delivery', 'completed', 'cancelled'],
    default: 'new' 
  })
  status: string;

  // ============ PIPELINE LINKS ============
  @Prop({ index: true })
  leadId?: string;

  @Prop({ index: true })
  quoteId?: string;

  @Prop({ index: true })
  depositId?: string;

  @Prop({ index: true })
  vin?: string;

  @Prop()
  lotId?: string;

  // ============ MANAGER & TEAM ============
  @Prop({ index: true })
  assignedTo?: string;

  @Prop({ index: true })
  managerId?: string;

  @Prop({ index: true })
  teamLeadId?: string;

  // ============ CONTRACT FLAGS ============
  @Prop()
  contractId?: string;

  @Prop({ default: false })
  contractSigned: boolean;

  @Prop()
  contractSignedAt?: Date;

  // ============ PAYMENT FLAGS ============
  @Prop({ default: false })
  invoiceCreated: boolean;

  @Prop({ default: false })
  depositPaid: boolean;

  @Prop()
  depositPaidAt?: Date;

  @Prop({ default: false })
  fullPaymentDone: boolean;

  @Prop()
  fullPaymentAt?: Date;

  // ============ SHIPMENT FLAGS ============
  @Prop()
  shipmentId?: string;

  @Prop({ default: false })
  shipmentCreated: boolean;

  @Prop({ default: false })
  trackingAdded: boolean;

  @Prop({ default: false })
  shipmentDelivered: boolean;

  @Prop()
  shipmentDeliveredAt?: Date;

  // ============ CALL/CONTACT FLAGS ============
  @Prop({ default: false })
  hasCalls: boolean;

  @Prop({ type: Number, default: 0 })
  callCount: number;

  @Prop()
  lastContactedAt?: Date;

  // ============ PRICING FROM QUOTE ============
  @Prop({ default: 'recommended', enum: ['minimum', 'recommended', 'aggressive'] })
  sourceScenario: string;

  @Prop({ type: Number, default: 0 })
  purchasePrice: number;

  @Prop({ type: Number, default: 0 })
  clientPrice: number;

  @Prop({ type: Number, default: 0 })
  internalCost: number;

  // ============ MARGIN TRACKING ============
  @Prop({ type: Number, default: 0 })
  estimatedMargin: number;

  @Prop({ type: Number, default: 0 })
  realCost: number;

  @Prop({ type: Number, default: 0 })
  realRevenue: number;

  @Prop({ type: Number, default: 0 })
  realProfit: number;

  // ============ OVERRIDE TRACKING ============
  @Prop({ default: false })
  overrideApplied: boolean;

  @Prop({ type: Number, default: 0 })
  overrideDelta: number;

  // ============ LEGACY VALUE ============
  @Prop({ type: Number, default: 0 })
  value: number;

  @Prop({ type: Number, default: 0 })
  commission: number;

  // ============ SCORING ============
  @Prop({ type: Number, default: 0 })
  score: number;

  @Prop({ type: Number, default: 0 })
  healthScore: number;

  // ============ META ============
  @Prop()
  description?: string;

  @Prop()
  deadline?: Date;

  @Prop()
  vehiclePlaceholder?: string;

  @Prop()
  vehicleTitle?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  createdBy: string;

  @Prop()
  closedAt?: Date;

  @Prop()
  closedReason?: string;

  @Prop()
  notes?: string;

  // ============ JOURNEY TRACKING ============
  @Prop()
  routedAt?: Date;

  @Prop()
  firstContactAt?: Date;

  @Prop()
  qualifiedAt?: Date;

  @Prop()
  carSelectedAt?: Date;

  @Prop()
  negotiationStartedAt?: Date;

  @Prop()
  contractSentAt?: Date;
}

export const DealSchema = SchemaFactory.createForClass(Deal);

// Indexes
DealSchema.index({ customerId: 1 });
DealSchema.index({ leadId: 1 });
DealSchema.index({ quoteId: 1 });
DealSchema.index({ vin: 1 });
DealSchema.index({ stage: 1 });
DealSchema.index({ status: 1 });
DealSchema.index({ assignedTo: 1 });
DealSchema.index({ managerId: 1 });
DealSchema.index({ teamLeadId: 1 });
DealSchema.index({ createdAt: -1 });
DealSchema.index({ stage: 1, managerId: 1 });
DealSchema.index({ contractSigned: 1 });
DealSchema.index({ depositPaid: 1 });
DealSchema.index({ shipmentDelivered: 1 });
