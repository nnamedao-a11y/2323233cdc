// Assignment Strategy
export enum AssignmentStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_LOADED = 'least_loaded',
  MANUAL = 'manual',
  FALLBACK = 'fallback',
  OVERDUE_REASSIGN = 'overdue_reassign',
}

// Assignment Reason
export enum AssignmentReason {
  AUTO_RULE_MATCH = 'auto_rule_match',
  NO_ELIGIBLE_MANAGER = 'no_eligible_manager',
  SLA_OVERDUE = 'sla_overdue',
  MANUAL_OVERRIDE = 'manual_override',
  FALLBACK_QUEUE = 'fallback_queue',
  FIRST_RESPONSE_OVERDUE = 'first_response_overdue',
  CAPACITY_EXCEEDED = 'capacity_exceeded',
}

// Assignment Trigger Source
export enum AssignmentTrigger {
  SYSTEM = 'system',
  ADMIN = 'admin',
  AUTOMATION = 'automation',
}
