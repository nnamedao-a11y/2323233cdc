export const DASHBOARD_CACHE = {
  MASTER_KEY_PREFIX: 'dashboard:master',
  TTL_SECONDS: 30,
  EXTENDED_TTL_SECONDS: 60,
};

export const LEAD_STATUS_GROUPS = {
  new: ['new'],
  inProgress: ['contacted', 'qualified', 'proposal', 'negotiation'],
  converted: ['won'],
  lost: ['lost', 'archived'],
};

export const WORKLOAD_THRESHOLDS = {
  OVERLOADED_SCORE: 50,
  BUSY_SCORE: 20,
  IDLE_ACTIVE_LEADS: 0,
};

export const SLA_DEFAULTS = {
  FIRST_RESPONSE_MINUTES: 60, // 1 година
  CALLBACK_MINUTES: 240, // 4 години
};
