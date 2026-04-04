/**
 * BIBI Cars - System Event Interface
 * Zoho-style event-driven architecture
 */

export interface SystemEvent {
  id: string;
  type: string;

  aggregateType: string;
  aggregateId: string;

  payload: Record<string, any>;

  actorType?: 'system' | 'manager' | 'team_lead' | 'owner' | 'customer' | 'provider';
  actorId?: string;

  source?: 'ui' | 'webhook' | 'cron' | 'api';

  createdAt: Date;
}

// Event Types Constants
export const EventTypes = {
  // Auth & Sessions
  STAFF_LOGIN_SUCCESS: 'staff.login_success',
  STAFF_LOGOUT: 'staff.logout',
  STAFF_SESSION_SUSPICIOUS: 'staff.session_suspicious',
  STAFF_SESSION_TERMINATED: 'staff.session_terminated',

  // Leads
  LEAD_CREATED: 'lead.created',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_REASSIGNED: 'lead.reassigned',
  LEAD_HOT: 'lead.hot',
  LEAD_STALE: 'lead.stale',
  LEAD_CONVERTED_TO_DEAL: 'lead.converted_to_deal',

  // Routing
  ROUTING_RULE_MATCHED: 'routing.rule_matched',
  ROUTING_FALLBACK_QUEUE: 'routing.fallback_queue',
  ROUTING_REASSIGNMENT_REQUIRED: 'routing.reassignment_required',

  // Calls
  CALL_CREATED: 'call.created',
  CALL_COMPLETED: 'call.completed',
  CALL_NO_ANSWER: 'call.no_answer',
  CALL_INTERESTED: 'call.interested',
  CALL_NEGOTIATION: 'call.negotiation',

  // Tasks
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_OVERDUE: 'task.overdue',
  TASK_BLOCKED: 'task.blocked',

  // Deals / Blueprint
  DEAL_CREATED: 'deal.created',
  DEAL_STAGE_CHANGED: 'deal.stage_changed',
  DEAL_STAGE_BLOCKED: 'deal.stage_blocked',
  DEAL_SCORE_RECALCULATE: 'deal.score_recalculate',
  DEAL_CLOSED_WON: 'deal.closed_won',
  DEAL_CLOSED_LOST: 'deal.closed_lost',

  // Contracts
  CONTRACT_CREATED: 'contract.created',
  CONTRACT_SENT: 'contract.sent',
  CONTRACT_SIGNED: 'contract.signed',
  CONTRACT_FAILED: 'contract.failed',
  CONTRACT_CREATE_REQUESTED: 'contract.create_requested',

  // Payments / Invoices
  INVOICE_CREATED: 'invoice.created',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_OVERDUE: 'invoice.overdue',
  INVOICE_OVERDUE_CRITICAL: 'invoice.overdue_critical',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_FAILED: 'invoice.failed',
  PAYMENT_UNLOCKED: 'payment.unlocked',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_FAILED: 'payment.failed',

  // Carfax
  CARFAX_REQUESTED: 'carfax.requested',
  CARFAX_PROCESSING: 'carfax.processing',
  CARFAX_UPLOADED: 'carfax.uploaded',
  CARFAX_REJECTED: 'carfax.rejected',

  // Shipping
  SHIPMENT_CREATED: 'shipment.created',
  SHIPMENT_TRACKING_ADDED: 'shipment.tracking_added',
  SHIPMENT_TRACKING_ENABLED: 'shipment.tracking_enabled',
  SHIPMENT_STATUS_CHANGED: 'shipment.status_changed',
  SHIPMENT_ETA_CHANGED: 'shipment.eta_changed',
  SHIPMENT_STALLED: 'shipment.stalled',
  SHIPMENT_DELAYED: 'shipment.delayed',
  SHIPMENT_DELIVERED: 'shipment.delivered',
  SHIPMENT_SYNC_FAILED: 'shipment.sync_failed',
  SHIPMENT_PREPARATION_REQUESTED: 'shipment.preparation_requested',

  // Integration / System
  INTEGRATION_DOWN: 'integration.down',
  INTEGRATION_RESTORED: 'integration.restored',
  WEBHOOK_INVALID_SIGNATURE: 'webhook.invalid_signature',
  WEBHOOK_SYNC_FALLBACK: 'webhook.sync_fallback_used',

  // Risk / Alerts
  RISK_FLAG_CREATED: 'risk.flag_created',
  RISK_FLAG_RESOLVED: 'risk.flag_resolved',
  ALERT_SENT: 'alert.sent',
  ALERT_FAILED: 'alert.failed',
  ALERT_NEGOTIATION_STARTED: 'alert.negotiation_started',

  // Journey
  JOURNEY_DEAL_COMPLETED: 'journey.deal_completed',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];
