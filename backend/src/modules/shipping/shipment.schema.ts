/**
 * Shipment Schema
 * 
 * Tracks vehicle shipping status with proper lifecycle stages
 * Integrated with PaymentFlowState for blocking logic
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Full shipment status lifecycle (matches PRD)
export enum ShipmentStatus {
  DEAL_CREATED = 'deal_created',
  CONTRACT_SIGNED = 'contract_signed',
  DEPOSIT_PAID = 'deposit_paid',
  LOT_PAID = 'lot_paid',
  TRANSPORT_TO_PORT = 'transport_to_port',
  AT_ORIGIN_PORT = 'at_origin_port',
  LOADED_ON_VESSEL = 'loaded_on_vessel',
  IN_TRANSIT = 'in_transit',
  AT_DESTINATION_PORT = 'at_destination_port',
  CUSTOMS = 'customs',
  READY_FOR_PICKUP = 'ready_for_pickup',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

// Tracking mode
export enum TrackingMode {
  MANUAL = 'manual',
  API = 'api',
  HYBRID = 'hybrid',
}

@Schema({ timestamps: true })
export class Shipment extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  dealId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  managerId: string;

  @Prop()
  customerId: string;

  @Prop()
  customerName: string;

  @Prop()
  customerEmail: string;

  @Prop({ required: true, index: true })
  vin: string;

  @Prop()
  vehicleTitle: string;

  // Shipping details
  @Prop()
  containerNumber: string;

  @Prop()
  bookingNumber: string;

  @Prop()
  carrier: string;

  @Prop()
  shippingLine: string;

  @Prop()
  vesselName: string;

  @Prop()
  vesselImo: string;

  // Ports
  @Prop()
  originPort: string;

  @Prop()
  destinationPort: string;

  @Prop()
  currentPort: string;

  @Prop()
  currentLocation: string;

  // Status - using new enum
  @Prop({ type: String, enum: ShipmentStatus, default: ShipmentStatus.DEAL_CREATED, index: true })
  currentStatus: ShipmentStatus;

  // Tracking
  @Prop({ type: String, enum: TrackingMode, default: TrackingMode.MANUAL })
  trackingMode: TrackingMode;

  @Prop({ default: false })
  trackingActive: boolean;

  // API Tracking fields (SeaRates/ShipsGo)
  @Prop()
  billOfLading: string;

  @Prop()
  trackingProvider: string; // 'searates' | 'shipsgo'

  @Prop()
  providerTrackingId: string;

  @Prop()
  lastSyncAt: Date;

  @Prop()
  lastSyncStatus: string; // 'ok' | 'fail'

  @Prop()
  lastSyncError: string;

  // ETA
  @Prop()
  eta: Date;

  // Dates
  @Prop()
  estimatedPickupDate: Date;

  @Prop()
  actualPickupDate: Date;

  @Prop()
  estimatedDepartureDate: Date;

  @Prop()
  actualDepartureDate: Date;

  @Prop()
  estimatedArrivalDate: Date;

  @Prop()
  actualArrivalDate: Date;

  @Prop()
  estimatedDeliveryDate: Date;

  @Prop()
  actualDeliveryDate: Date;

  // Events timeline
  @Prop({ type: [Object], default: [] })
  events: Array<{
    status: string;
    location: string;
    description: string;
    timestamp: Date;
  }>;

  // Documents
  @Prop({ type: [Object], default: [] })
  documents: Array<{
    type: string;
    name: string;
    url: string;
    uploadedAt: Date;
  }>;

  // Metadata
  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop()
  notes: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ShipmentSchema = SchemaFactory.createForClass(Shipment);

// Indexes
ShipmentSchema.index({ id: 1 }, { unique: true });
ShipmentSchema.index({ userId: 1 });
ShipmentSchema.index({ managerId: 1 });
ShipmentSchema.index({ dealId: 1 });
ShipmentSchema.index({ vin: 1 });
ShipmentSchema.index({ containerNumber: 1 });
ShipmentSchema.index({ currentStatus: 1 });
ShipmentSchema.index({ trackingActive: 1 });
ShipmentSchema.index({ createdAt: -1 });

