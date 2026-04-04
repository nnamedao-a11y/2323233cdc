/**
 * Master Dashboard Response Interface
 * Повна структура відповіді для control layer dashboard
 */

export interface ManagerWorkload {
  managerId: string;
  name: string;
  activeLeads: number;
  openTasks: number;
  overdueTasks: number;
  score: number;
  status: 'ok' | 'busy' | 'overloaded' | 'idle';
}

export interface SlaDashboardMetrics {
  overdueLeads: number;
  overdueTasks: number;
  overdueCallbacks: number;
  avgFirstResponseMinutes: number;
  missedSlaRate: number;
}

export interface WorkloadDashboardMetrics {
  totalManagers: number;
  overloadedManagers: number;
  idleManagers: number;
  busyManagers: number;
  managers: ManagerWorkload[];
}

export interface LeadsDashboardMetrics {
  newCount: number;
  inProgressCount: number;
  convertedCount: number;
  lostCount: number;
  unassignedCount: number;
  totalActive: number;
}

export interface CallbacksDashboardMetrics {
  missedCalls: number;
  noAnswerLeads: number;
  followUpsDue: number;
  smsTriggered: number;
  callbacksScheduled: number;
}

export interface DepositsDashboardMetrics {
  pendingDeposits: number;
  depositsWithoutProof: number;
  pendingVerification: number;
  verifiedToday: number;
  rejectedToday: number;
  totalPendingAmount: number;
}

export interface DocumentsDashboardMetrics {
  pendingVerification: number;
  rejectedCount: number;
  uploadedToday: number;
  archivedCount: number;
  verifiedToday: number;
}

export interface RoutingDashboardMetrics {
  fallbackAssignments: number;
  reassignmentRate: number;
  averageAssignmentTimeSec: number;
  unassignedLeads: number;
  overloadedQueueRisk: number;
}

export interface SystemHealthDashboardMetrics {
  failedJobs: number;
  queueBacklog: number;
  smsFailures: number;
  emailFailures: number;
  webhookFailures: number;
  systemStatus: 'healthy' | 'warning' | 'critical';
}

export interface VehiclesDashboardMetrics {
  total: number;
  active: number;
  sold: number;
  reserved: number;
  newToday: number;
  updatedToday: number;
  bySource: Array<{ source: string; count: number }>;
  avgPrice: number;
  recentVehicles: Array<{
    id: string;
    vin: string;
    title: string;
    source: string;
    price: number;
    status: string;
    createdAt: Date;
  }>;
}

export interface MasterDashboardResponse {
  generatedAt: string;
  period: 'day' | 'week' | 'month';
  sla: SlaDashboardMetrics;
  workload: WorkloadDashboardMetrics;
  leads: LeadsDashboardMetrics;
  callbacks: CallbacksDashboardMetrics;
  deposits: DepositsDashboardMetrics;
  documents: DocumentsDashboardMetrics;
  routing: RoutingDashboardMetrics;
  system: SystemHealthDashboardMetrics;
  vehicles?: VehiclesDashboardMetrics;
}

export interface DashboardKpiSummary {
  newLeadsToday: number;
  overdueLeads: number;
  pendingDeposits: number;
  pendingVerificationDocs: number;
  overloadedManagers: number;
  failedJobs: number;
  criticalAlerts: number;
}
