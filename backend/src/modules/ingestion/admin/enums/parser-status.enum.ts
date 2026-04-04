/**
 * Parser Status Enum
 */
export enum ParserStatus {
  RUNNING = 'running',
  IDLE = 'idle',
  STOPPED = 'stopped',
  DEGRADED = 'degraded',
  ERROR = 'error',
}

export enum ParserAlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum ParserLogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export enum ParserLogEvent {
  RUN_STARTED = 'run_started',
  RUN_FINISHED = 'run_finished',
  RUN_FAILED = 'run_failed',
  RUN_STOPPED = 'run_stopped',
  PARSE_SUCCESS = 'parse_success',
  PARSE_FAILED = 'parse_failed',
  PROXY_SWITCHED = 'proxy_switched',
  CIRCUIT_OPENED = 'circuit_opened',
  CIRCUIT_CLOSED = 'circuit_closed',
  HEALTH_CHECK = 'health_check',
  ALERT_CREATED = 'alert_created',
  ALERT_RESOLVED = 'alert_resolved',
}

export enum ParserAlertCode {
  PARSER_DEGRADED = 'parser_degraded',
  PARSER_DOWN = 'parser_down',
  PROXY_POOL_EMPTY = 'proxy_pool_empty',
  PROXY_POOL_DEGRADED = 'proxy_pool_degraded',
  HIGH_ERROR_RATE = 'high_error_rate',
  RUNNER_STUCK = 'runner_stuck',
  CIRCUIT_BREAKER_OPEN = 'circuit_breaker_open',
  NO_RECENT_SUCCESS = 'no_recent_success',
}
