import { AssignmentStrategy } from '../enums/assignment.enum';

// Routing Context - data for routing decision
export interface RoutingContext {
  leadId: string;
  market?: string;
  language?: string;
  source?: string;
  leadType?: string;
  priority?: string;
  createdAt: Date;
  isVip?: boolean;
}

// Manager Workload snapshot
export interface ManagerWorkload {
  managerId: string;
  email: string;
  firstName: string;
  lastName: string;
  activeLeads: number;
  openTasks: number;
  overdueTasks: number;
  score: number;
  isAvailable: boolean;
  maxActiveLeads?: number;
  supportedMarkets?: string[];
  supportedLanguages?: string[];
  supportedSources?: string[];
  lastAssignedAt?: Date;
  assignmentPriority?: number;
}

// Assignment Result
export interface AssignmentResult {
  success: boolean;
  managerId?: string;
  managerName?: string;
  strategy: AssignmentStrategy;
  reason: string;
  error?: string;
  historyId?: string;
  isFallback?: boolean;
  isFallbackQueue?: boolean;
}

// Finalize Assignment params
export interface FinalizeAssignmentParams {
  leadId: string;
  managerId: string;
  strategy: AssignmentStrategy;
  reason: string;
  previousManagerId?: string;
  triggeredBy: 'system' | 'admin' | 'automation';
  triggeredByUserId?: string;
  leadSnapshot?: Record<string, any>;
  managerLoadSnapshot?: {
    previousManagerActiveLeads?: number;
    newManagerActiveLeads?: number;
    newManagerOpenTasks?: number;
    newManagerOverdueTasks?: number;
  };
}

// Lead for routing (minimal fields needed)
export interface LeadForRouting {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source?: string;
  status: string;
  contactStatus: string;
  assignedTo?: string;
  assignedAt?: Date;
  reassignedCount?: number;
  firstResponseDueAt?: Date;
  firstResponseAt?: Date;
  isOverdueForFirstResponse?: boolean;
  escalationLevel?: number;
  createdAt: Date;
}
