import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../shared/utils';

export enum ReportProvider {
  CARVERTICAL = 'carvertical',
  COPART = 'copart',
  IAAI = 'iaai',
  MANUAL = 'manual',
}

export enum ReportStatus {
  REQUESTED = 'requested',             // User requested
  PENDING_CALL = 'pending_manager_call', // Waiting for call
  PENDING_APPROVAL = 'pending_approval', // Call done, waiting approval
  APPROVED = 'approved',               // Manager approved
  PURCHASED = 'purchased',             // Report bought
  UNLOCKED = 'unlocked',               // Delivered to user
  EXPIRED = 'expired',                 // Access expired (48-72h)
  ARCHIVED = 'archived',               // Read-only archive
  DENIED = 'denied',                   // Rejected
  BLOCKED = 'blocked',                 // Abuse blocked
}

@Schema({ timestamps: true })
export class HistoryReport extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  // === IDENTIFIERS ===
  @Prop({ required: true, index: true })
  vin: string;

  @Prop({ index: true })
  leadId?: string;

  @Prop({ index: true })
  userId?: string;  // Customer who requested

  @Prop({ index: true })
  managerId?: string;  // Manager who approved

  // === PROVIDER ===
  @Prop({ type: String, enum: ReportProvider, default: ReportProvider.CARVERTICAL })
  provider: ReportProvider;

  @Prop({ type: String, enum: ReportStatus, default: ReportStatus.REQUESTED })
  status: ReportStatus;

  // === REPORT DATA ===
  @Prop({ type: Object })
  reportData?: {
    accidents?: number;
    mileageHistory?: any[];
    ownerCount?: number;
    damageRecords?: any[];
    serviceHistory?: any[];
    titleStatus?: string;
    lastUpdate?: Date;
  };

  @Prop()
  reportUrl?: string;  // If external link

  // === COST TRACKING ===
  @Prop({ type: Number, default: 0 })
  cost: number;  // How much we paid for report

  @Prop({ default: false })
  isFree: boolean;

  @Prop({ default: false })
  isCached: boolean;

  // === ANTI-ABUSE ===
  @Prop()
  deviceId?: string;

  @Prop()
  ipAddress?: string;

  // === APPROVAL ===
  @Prop()
  approvedAt?: Date;

  @Prop()
  approvedBy?: string;  // Manager ID

  @Prop()
  approvalNote?: string;

  @Prop()
  deniedReason?: string;

  // === DELIVERY & EXPIRATION ===
  @Prop()
  deliveredAt?: Date;

  @Prop()
  expiresAt?: Date;  // 48-72h after unlock

  @Prop({ default: 0 })
  viewCount: number;

  // === CALL REQUIREMENT ===
  @Prop({ default: false })
  callVerified: boolean;  // Was there a real call?

  @Prop()
  callSessionId?: string;

  @Prop({ type: Number })
  callDuration?: number;  // Minimum call duration for unlock

  // === ROI TRACKING ===
  @Prop()
  dealId?: string;  // If this report led to a deal

  @Prop({ type: Number })
  dealProfit?: number;  // Profit from the deal

  @Prop({ type: Number })
  roi?: number;  // Calculated ROI: (dealProfit - cost) / cost * 100
}

export const HistoryReportSchema = SchemaFactory.createForClass(HistoryReport);

HistoryReportSchema.index({ vin: 1 });
HistoryReportSchema.index({ userId: 1 });
HistoryReportSchema.index({ leadId: 1 });
HistoryReportSchema.index({ managerId: 1 });
HistoryReportSchema.index({ status: 1 });
HistoryReportSchema.index({ createdAt: -1 });
