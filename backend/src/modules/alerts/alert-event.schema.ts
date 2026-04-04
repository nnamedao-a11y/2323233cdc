/**
 * Alert Events Schema
 * 
 * Logs all sent alerts for analytics and debugging
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum AlertPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum AlertChannel {
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  IN_APP = 'in_app',
}

export enum AlertEventType {
  // Security
  MANAGER_LOGIN = 'manager.login',
  MANAGER_LOGIN_SUSPICIOUS = 'manager.login.suspicious',
  TEAMLEAD_LOGIN_REQUEST = 'teamlead.login_request',
  TEAMLEAD_LOGIN_APPROVED = 'teamlead.login.approved',
  SESSION_TERMINATED = 'session.terminated',
  NEW_DEVICE_DETECTED = 'new_device.detected',
  
  // Leads
  LEAD_CREATED = 'lead.created',
  HOT_LEAD_CREATED = 'lead.hot_created',
  HOT_LEAD_MISSED = 'lead.hot_missed',
  
  // Calls
  CALL_NO_ANSWER = 'call.no_answer',
  CALL_CALLBACK_DUE = 'call.callback_due',
  
  // Carfax
  CARFAX_REQUESTED = 'carfax.requested',
  CARFAX_UPLOADED = 'carfax.uploaded',
  CARFAX_ABUSE_DETECTED = 'carfax.abuse_detected',
  
  // Payments
  INVOICE_CREATED = 'invoice.created',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_OVERDUE = 'invoice.overdue',
  
  // Contracts
  CONTRACT_SIGNED = 'contract.signed',
  CONTRACT_FAILED = 'contract.failed',
  
  // Shipping
  SHIPMENT_UPDATED = 'shipment.updated',
  SHIPMENT_DELAYED = 'shipment.delayed',
  SHIPMENT_ARRIVED = 'shipment.arrived',
  SHIPMENT_STATUS_CHANGED = 'shipment.status_changed',
  SHIPMENT_ETA_CHANGED = 'shipment.eta_changed',
  SHIPMENT_SYNC_FAILED = 'shipment.sync_failed',
  SHIPMENT_STALLED = 'shipment.stalled',
  
  // KPI
  MANAGER_KPI_CRITICAL = 'manager.kpi.critical',
  MANAGER_PERFORMANCE_LOW = 'manager.performance.low',
  
  // Tasks
  TASK_OVERDUE = 'task.overdue',
}

@Schema({ timestamps: true })
export class AlertEvent extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ type: String, enum: AlertEventType, required: true })
  eventType: AlertEventType;

  @Prop({ type: String, enum: AlertPriority, default: AlertPriority.MEDIUM })
  priority: AlertPriority;

  @Prop({ type: String, enum: AlertChannel })
  channel: AlertChannel;

  // Recipients
  @Prop()
  recipientId: string; // User ID

  @Prop()
  recipientRole: string; // owner, team_lead

  @Prop()
  telegramChatId: string;

  // Content
  @Prop()
  title: string;

  @Prop()
  message: string;

  // Context
  @Prop()
  entityType: string; // lead, manager, invoice, etc.

  @Prop()
  entityId: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  // Status
  @Prop({ default: false })
  sent: boolean;

  @Prop()
  sentAt: Date;

  @Prop()
  error: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const AlertEventSchema = SchemaFactory.createForClass(AlertEvent);

AlertEventSchema.index({ id: 1 }, { unique: true });
AlertEventSchema.index({ eventType: 1 });
AlertEventSchema.index({ recipientId: 1 });
AlertEventSchema.index({ priority: 1 });
AlertEventSchema.index({ sent: 1 });
AlertEventSchema.index({ createdAt: -1 });
