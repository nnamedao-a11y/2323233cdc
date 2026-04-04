// User Roles - Simplified 3-tier hierarchy
export enum UserRole {
  OWNER = 'owner',           // Власник - повний доступ
  TEAM_LEAD = 'team_lead',   // Старший менеджер - керує командою
  MANAGER = 'manager',       // Менеджер - працює з клієнтами
  CUSTOMER = 'customer',     // Клієнт (для публічного доступу)
}

// Legacy role mapping (for migration)
export const LEGACY_ROLE_MAP = {
  'master_admin': UserRole.OWNER,
  'admin': UserRole.TEAM_LEAD,
  'moderator': UserRole.TEAM_LEAD,
  'finance': UserRole.OWNER,
};

// Lead Status Pipeline (Sales)
export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
  ARCHIVED = 'archived',
}

// Contact Status (Communication/Call Center)
export enum ContactStatus {
  NEW_REQUEST = 'new_request',
  MISSED_CALL = 'missed_call',
  CALLBACK_SCHEDULED = 'callback_scheduled',
  CALLED_ONCE = 'called_once',
  NO_ANSWER = 'no_answer',
  CONTACTED = 'contacted',
  AWAITING_REPLY = 'awaiting_reply',
  FOLLOW_UP_REQUIRED = 'follow_up_required',
  CONVERTED = 'converted',
  LOST_UNREACHABLE = 'lost_unreachable',
}

// Call Result
export enum CallResult {
  ANSWERED = 'answered',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  VOICEMAIL = 'voicemail',
  WRONG_NUMBER = 'wrong_number',
  CALLBACK_REQUESTED = 'callback_requested',
  NOT_INTERESTED = 'not_interested',
  DEAL_DISCUSSED = 'deal_discussed',
}

// Communication Channel
export enum CommunicationChannel {
  PHONE = 'phone',
  SMS = 'sms',
  EMAIL = 'email',
  VIBER = 'viber',
  WHATSAPP = 'whatsapp',
}

// Automation Trigger
export enum AutomationTrigger {
  LEAD_CREATED = 'lead_created',
  LEAD_ASSIGNED = 'lead_assigned',
  LEAD_STATUS_CHANGED = 'lead_status_changed',
  CONTACT_STATUS_CHANGED = 'contact_status_changed',
  CALL_COMPLETED = 'call_completed',
  CALL_MISSED = 'call_missed',
  TASK_OVERDUE = 'task_overdue',
  TASK_COMPLETED = 'task_completed',
  DEAL_CREATED = 'deal_created',
  DEAL_STATUS_CHANGED = 'deal_status_changed',
  DEPOSIT_RECEIVED = 'deposit_received',
  DEPOSIT_PENDING = 'deposit_pending',
  NO_RESPONSE_24H = 'no_response_24h',
  NO_RESPONSE_48H = 'no_response_48h',
  // Routing triggers
  LEAD_FIRST_RESPONSE_OVERDUE = 'lead_first_response_overdue',
  LEAD_REASSIGNED = 'lead_reassigned',
}

// Automation Action
export enum AutomationAction {
  CREATE_TASK = 'create_task',
  ASSIGN_MANAGER = 'assign_manager',
  CHANGE_STATUS = 'change_status',
  SEND_NOTIFICATION = 'send_notification',
  SEND_EMAIL = 'send_email',
  SEND_SMS = 'send_sms',
  SEND_VIBER = 'send_viber', // Future
  ESCALATE_TO_ADMIN = 'escalate_to_admin',
  SCHEDULE_CALLBACK = 'schedule_callback',
  SCHEDULE_FOLLOW_UP = 'schedule_follow_up',
  UPDATE_CONTACT_STATUS = 'update_contact_status',
}

// Lead Source
export enum LeadSource {
  WEBSITE = 'website',
  REFERRAL = 'referral',
  SOCIAL_MEDIA = 'social_media',
  COLD_CALL = 'cold_call',
  ADVERTISEMENT = 'advertisement',
  PARTNER = 'partner',
  VEHICLE_COPART = 'vehicle_copart',
  VEHICLE_IAAI = 'vehicle_iaai',
  VIN_ENGINE = 'vin_engine',
  OTHER = 'other',
}

// Deal Status Pipeline
export enum DealStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAID = 'paid',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Deposit Status Lifecycle
export enum DepositStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

// Task Status
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

// Task Priority
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

// Notification Type
export enum NotificationType {
  // Lead notifications
  NEW_LEAD = 'new_lead',
  LEAD_ASSIGNED = 'lead_assigned',
  LEAD_STATUS_CHANGED = 'lead_status_changed',
  LEAD_SLA_WARNING = 'lead_sla_warning',
  LEAD_SLA_BREACH = 'lead_sla_breach',
  
  // Task notifications
  TASK_DUE = 'task_due',
  TASK_OVERDUE = 'task_overdue',
  TASK_ASSIGNED = 'task_assigned',
  
  // Deal notifications
  DEAL_CREATED = 'deal_created',
  DEAL_UPDATE = 'deal_update',
  DEAL_STATUS_CHANGED = 'deal_status_changed',
  DEAL_COMPLETED = 'deal_completed',
  
  // Deposit notifications
  DEPOSIT_CREATED = 'deposit_created',
  DEPOSIT_RECEIVED = 'deposit_received',
  DEPOSIT_PENDING = 'deposit_pending',
  DEPOSIT_CONFIRMED = 'deposit_confirmed',
  DEPOSIT_REFUNDED = 'deposit_refunded',
  
  // Document notifications
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_PENDING_VERIFICATION = 'document_pending_verification',
  DOCUMENT_VERIFIED = 'document_verified',
  DOCUMENT_REJECTED = 'document_rejected',
  
  // Customer notifications
  CUSTOMER_REGISTERED = 'customer_registered',
  CUSTOMER_UPDATED = 'customer_updated',
  
  // Parser notifications
  PARSER_COMPLETED = 'parser_completed',
  PARSER_FAILED = 'parser_failed',
  
  // System notifications
  SYSTEM = 'system',
  SYSTEM_WARNING = 'system_warning',
  SYSTEM_ERROR = 'system_error',
}

// Audit Action
export enum AuditAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  ASSIGN = 'assign',
  STATUS_CHANGE = 'status_change',
  EXPORT = 'export',
  VIEW = 'view',
}

// Entity Type
export enum EntityType {
  USER = 'user',
  LEAD = 'lead',
  CUSTOMER = 'customer',
  DEAL = 'deal',
  DEPOSIT = 'deposit',
  TASK = 'task',
  NOTE = 'note',
  FILE = 'file',
  DOCUMENT = 'document',
}

// Customer Type
export enum CustomerType {
  INDIVIDUAL = 'individual',
  COMPANY = 'company',
}
