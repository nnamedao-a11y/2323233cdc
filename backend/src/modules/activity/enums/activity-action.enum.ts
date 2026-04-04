// Activity Actions - всі значимі дії в системі
export enum ActivityAction {
  // Auth
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGIN_FAILED = 'login_failed',

  // Leads
  LEAD_CREATED = 'lead_created',
  LEAD_UPDATED = 'lead_updated',
  LEAD_ASSIGNED = 'lead_assigned',
  LEAD_REASSIGNED = 'lead_reassigned',
  LEAD_STATUS_CHANGED = 'lead_status_changed',
  LEAD_CONVERTED = 'lead_converted',
  LEAD_DELETED = 'lead_deleted',

  // Calls
  CALL_STARTED = 'call_started',
  CALL_COMPLETED = 'call_completed',
  CALL_MISSED = 'call_missed',
  CALL_NO_ANSWER = 'call_no_answer',
  CALLBACK_SCHEDULED = 'callback_scheduled',
  CALLBACK_COMPLETED = 'callback_completed',
  CALLBACK_MISSED = 'callback_missed',

  // Tasks
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_COMPLETED = 'task_completed',
  TASK_OVERDUE = 'task_overdue',
  TASK_CANCELLED = 'task_cancelled',

  // Messages
  SMS_SENT = 'sms_sent',
  SMS_DELIVERED = 'sms_delivered',
  SMS_FAILED = 'sms_failed',
  EMAIL_SENT = 'email_sent',
  EMAIL_DELIVERED = 'email_delivered',
  EMAIL_FAILED = 'email_failed',

  // Documents
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_VERIFIED = 'document_verified',
  DOCUMENT_REJECTED = 'document_rejected',
  DOCUMENT_ARCHIVED = 'document_archived',

  // Deposits
  DEPOSIT_CREATED = 'deposit_created',
  DEPOSIT_CONFIRMED = 'deposit_confirmed',
  DEPOSIT_COMPLETED = 'deposit_completed',
  DEPOSIT_REFUNDED = 'deposit_refunded',

  // Deals
  DEAL_CREATED = 'deal_created',
  DEAL_UPDATED = 'deal_updated',
  DEAL_STATUS_CHANGED = 'deal_status_changed',
  DEAL_COMPLETED = 'deal_completed',
  DEAL_CANCELLED = 'deal_cancelled',

  // Customers
  CUSTOMER_CREATED = 'customer_created',
  CUSTOMER_UPDATED = 'customer_updated',

  // Routing
  ROUTING_ASSIGNED = 'routing_assigned',
  ROUTING_REASSIGNED = 'routing_reassigned',
  ROUTING_FALLBACK = 'routing_fallback',

  // Vehicles (Parser Integration)
  VEHICLE_CREATED = 'vehicle_created',
  VEHICLE_UPDATED = 'vehicle_updated',
  VEHICLE_STATUS_CHANGED = 'vehicle_status_changed',
  VEHICLE_RESERVED = 'vehicle_reserved',
  VEHICLE_LINKED = 'vehicle_linked',
  VEHICLE_DELETED = 'vehicle_deleted',

  // System
  SYSTEM_ERROR = 'system_error',
  SLA_BREACH = 'sla_breach',
}

export enum ActivityEntityType {
  USER = 'user',
  LEAD = 'lead',
  CUSTOMER = 'customer',
  DEAL = 'deal',
  DEPOSIT = 'deposit',
  TASK = 'task',
  CALL = 'call',
  MESSAGE = 'message',
  DOCUMENT = 'document',
  VEHICLE = 'vehicle',
  SYSTEM = 'system',
}

export enum ActivitySource {
  WEB = 'web',
  API = 'api',
  SYSTEM = 'system',
  AUTOMATION = 'automation',
}
