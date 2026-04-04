/**
 * Team Workspace Service
 * 
 * Business logic for Team Lead Layer
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

export interface DashboardKPIs {
  totalManagers: number;
  activeManagers: number;
  totalLeads: number;
  hotLeads: number;
  totalDeals: number;
  pendingTasks: number;
  overdueInvoices: number;
  activeShipments: number;
}

export interface ManagerStats {
  id: string;
  name: string;
  email: string;
  status: string;
  leadsCount: number;
  dealsCount: number;
  tasksCount: number;
  overdueCount: number;
  revenue: number;
  conversionRate: number;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

@Injectable()
export class TeamWorkspaceService {
  private readonly logger = new Logger(TeamWorkspaceService.name);

  constructor(
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Task') private taskModel: Model<any>,
    @InjectModel('Invoice') private invoiceModel: Model<any>,
    @InjectModel('Shipment') private shipmentModel: Model<any>,
  ) {}

  /**
   * Get Dashboard KPIs for Team Lead
   */
  async getDashboardKPIs(user: any): Promise<DashboardKPIs> {
    try {
      const [
        totalManagers,
        activeManagers,
        totalLeads,
        hotLeads,
        totalDeals,
        pendingTasks,
        overdueInvoices,
        activeShipments
      ] = await Promise.all([
        this.userModel.countDocuments({ role: 'manager' }),
        this.userModel.countDocuments({ role: 'manager', isActive: true }),
        this.leadModel.countDocuments({}),
        this.leadModel.countDocuments({ score: { $gte: 70 } }),
        this.dealModel.countDocuments({}),
        this.taskModel.countDocuments({ status: { $in: ['pending', 'in_progress'] } }),
        this.invoiceModel.countDocuments({ status: 'overdue' }),
        this.shipmentModel.countDocuments({ status: { $in: ['in_transit', 'pending'] } })
      ]);

      return {
        totalManagers,
        activeManagers,
        totalLeads,
        hotLeads,
        totalDeals,
        pendingTasks,
        overdueInvoices,
        activeShipments
      };
    } catch (error) {
      this.logger.error(`getDashboardKPIs error: ${error.message}`);
      return {
        totalManagers: 0,
        activeManagers: 0,
        totalLeads: 0,
        hotLeads: 0,
        totalDeals: 0,
        pendingTasks: 0,
        overdueInvoices: 0,
        activeShipments: 0
      };
    }
  }

  /**
   * Get Managers with Statistics
   */
  async getManagersWithStats(status?: string): Promise<ManagerStats[]> {
    try {
      const filter: any = { role: 'manager' };
      if (status) filter.isActive = status === 'active';

      const managers = await this.userModel.find(filter).lean();

      const stats = await Promise.all(managers.map(async (manager) => {
        const [leadsCount, dealsCount, tasksCount, overdueCount] = await Promise.all([
          this.leadModel.countDocuments({ managerId: manager.id }),
          this.dealModel.countDocuments({ managerId: manager.id }),
          this.taskModel.countDocuments({ assignedTo: manager.id, status: { $ne: 'completed' } }),
          this.invoiceModel.countDocuments({ managerId: manager.id, status: 'overdue' })
        ]);

        // Calculate revenue from paid invoices
        const paidInvoices = await this.invoiceModel.aggregate([
          { $match: { managerId: manager.id, status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const revenue = paidInvoices[0]?.total || 0;

        // Calculate conversion rate
        const convertedDeals = await this.dealModel.countDocuments({ 
          managerId: manager.id, 
          stage: { $in: ['won', 'delivered'] }
        });
        const conversionRate = leadsCount > 0 ? Math.round((convertedDeals / leadsCount) * 100) : 0;

        return {
          id: manager.id,
          name: `${manager.firstName} ${manager.lastName}`,
          email: manager.email,
          status: manager.isActive ? 'active' : 'inactive',
          leadsCount,
          dealsCount,
          tasksCount,
          overdueCount,
          revenue,
          conversionRate
        };
      }));

      return stats;
    } catch (error) {
      this.logger.error(`getManagersWithStats error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get Manager Profile
   */
  async getManagerProfile(managerId: string): Promise<any> {
    try {
      const manager = await this.userModel.findOne({ id: managerId }).lean();
      if (!manager) return null;

      const [leads, deals, tasks, invoices] = await Promise.all([
        this.leadModel.find({ managerId }).sort({ createdAt: -1 }).limit(10).lean(),
        this.dealModel.find({ managerId }).sort({ createdAt: -1 }).limit(10).lean(),
        this.taskModel.find({ assignedTo: managerId }).sort({ dueDate: 1 }).limit(10).lean(),
        this.invoiceModel.find({ managerId }).sort({ createdAt: -1 }).limit(10).lean()
      ]);

      return {
        ...manager,
        _id: undefined,
        recentLeads: leads,
        recentDeals: deals,
        pendingTasks: tasks,
        recentInvoices: invoices
      };
    } catch (error) {
      this.logger.error(`getManagerProfile error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get Team Alerts
   */
  async getAlerts(severity?: string): Promise<Alert[]> {
    try {
      const alerts: Alert[] = [];
      const now = new Date();

      // Critical: Overdue invoices > 5 days
      const criticalOverdue = await this.invoiceModel.find({
        status: 'overdue',
        dueDate: { $lt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) }
      }).limit(10).lean();

      criticalOverdue.forEach(inv => {
        alerts.push({
          id: `alert-inv-${inv.id}`,
          type: 'OVERDUE_INVOICE',
          severity: 'critical',
          message: `Інвойс ${inv.title || inv.id} прострочений більше 5 днів`,
          entityType: 'invoice',
          entityId: inv.id,
          createdAt: inv.dueDate
        });
      });

      // Warning: Stalled shipments
      const stalledShipments = await this.shipmentModel.find({
        status: 'in_transit',
        lastUpdate: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
      }).limit(10).lean();

      stalledShipments.forEach(ship => {
        alerts.push({
          id: `alert-ship-${ship.id}`,
          type: 'STALLED_SHIPMENT',
          severity: 'warning',
          message: `Доставка ${ship.trackingNumber || ship.id} без оновлень 7+ днів`,
          entityType: 'shipment',
          entityId: ship.id,
          createdAt: ship.lastUpdate
        });
      });

      // Warning: Overdue tasks
      const overdueTasks = await this.taskModel.find({
        status: { $ne: 'completed' },
        dueDate: { $lt: now }
      }).limit(10).lean();

      overdueTasks.forEach(task => {
        alerts.push({
          id: `alert-task-${task.id}`,
          type: 'OVERDUE_TASK',
          severity: 'warning',
          message: `Задача "${task.title}" прострочена`,
          entityType: 'task',
          entityId: task.id,
          createdAt: task.dueDate
        });
      });

      // Filter by severity if provided
      if (severity) {
        return alerts.filter(a => a.severity === severity);
      }

      return alerts.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
    } catch (error) {
      this.logger.error(`getAlerts error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get Overdue Payments
   */
  async getOverduePayments(): Promise<any[]> {
    try {
      const overdueInvoices = await this.invoiceModel.find({
        status: 'overdue'
      }).sort({ dueDate: 1 }).limit(50).lean();

      return overdueInvoices.map(inv => ({
        id: inv.id,
        title: inv.title,
        amount: inv.amount,
        currency: inv.currency || 'USD',
        dueDate: inv.dueDate,
        daysPastDue: Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)),
        customerId: inv.userId,
        customerName: inv.customerName,
        managerId: inv.managerId,
        dealId: inv.dealId
      }));
    } catch (error) {
      this.logger.error(`getOverduePayments error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get Stalled Shipments
   */
  async getStalledShipments(): Promise<any[]> {
    try {
      const now = new Date();
      const stalledShipments = await this.shipmentModel.find({
        status: { $in: ['in_transit', 'pending'] },
        $or: [
          { lastUpdate: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
          { lastUpdate: { $exists: false } }
        ]
      }).sort({ lastUpdate: 1 }).limit(50).lean();

      return stalledShipments.map(ship => ({
        id: ship.id,
        trackingNumber: ship.trackingNumber,
        status: ship.status,
        origin: ship.origin,
        destination: ship.destination,
        lastUpdate: ship.lastUpdate,
        daysSinceUpdate: ship.lastUpdate 
          ? Math.floor((Date.now() - new Date(ship.lastUpdate).getTime()) / (1000 * 60 * 60 * 24))
          : null,
        dealId: ship.dealId,
        managerId: ship.managerId
      }));
    } catch (error) {
      this.logger.error(`getStalledShipments error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get Performance Metrics
   */
  async getPerformanceMetrics(days: number): Promise<any> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        newLeads,
        convertedLeads,
        newDeals,
        wonDeals,
        completedTasks,
        paidInvoices
      ] = await Promise.all([
        this.leadModel.countDocuments({ createdAt: { $gte: startDate } }),
        this.leadModel.countDocuments({ status: 'converted', updatedAt: { $gte: startDate } }),
        this.dealModel.countDocuments({ createdAt: { $gte: startDate } }),
        this.dealModel.countDocuments({ stage: 'won', updatedAt: { $gte: startDate } }),
        this.taskModel.countDocuments({ status: 'completed', completedAt: { $gte: startDate } }),
        this.invoiceModel.countDocuments({ status: 'paid', paidAt: { $gte: startDate } })
      ]);

      const revenueResult = await this.invoiceModel.aggregate([
        { $match: { status: 'paid', paidAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      return {
        period: days,
        startDate,
        endDate: new Date(),
        leads: {
          new: newLeads,
          converted: convertedLeads,
          conversionRate: newLeads > 0 ? Math.round((convertedLeads / newLeads) * 100) : 0
        },
        deals: {
          new: newDeals,
          won: wonDeals,
          winRate: newDeals > 0 ? Math.round((wonDeals / newDeals) * 100) : 0
        },
        tasks: {
          completed: completedTasks
        },
        revenue: {
          total: revenueResult[0]?.total || 0,
          invoicesPaid: paidInvoices
        }
      };
    } catch (error) {
      this.logger.error(`getPerformanceMetrics error: ${error.message}`);
      return {
        period: days,
        leads: { new: 0, converted: 0, conversionRate: 0 },
        deals: { new: 0, won: 0, winRate: 0 },
        tasks: { completed: 0 },
        revenue: { total: 0, invoicesPaid: 0 }
      };
    }
  }

  /**
   * Get Reassignment Queue
   */
  async getReassignmentQueue(): Promise<any[]> {
    try {
      // Find leads/deals that need reassignment
      const inactiveManagers = await this.userModel.find({ 
        role: 'manager', 
        isActive: false 
      }).lean();

      const inactiveManagerIds = inactiveManagers.map(m => m.id);

      const leadsToReassign = await this.leadModel.find({
        managerId: { $in: inactiveManagerIds },
        status: { $nin: ['converted', 'lost', 'archived'] }
      }).limit(50).lean();

      const dealsToReassign = await this.dealModel.find({
        managerId: { $in: inactiveManagerIds },
        stage: { $nin: ['won', 'lost', 'cancelled'] }
      }).limit(50).lean();

      const queue = [
        ...leadsToReassign.map(lead => ({
          id: lead.id,
          type: 'lead',
          name: lead.name || lead.email,
          currentManagerId: lead.managerId,
          reason: 'inactive_manager',
          createdAt: lead.createdAt
        })),
        ...dealsToReassign.map(deal => ({
          id: deal.id,
          type: 'deal',
          name: deal.title || deal.vin,
          currentManagerId: deal.managerId,
          reason: 'inactive_manager',
          createdAt: deal.createdAt
        }))
      ];

      return queue;
    } catch (error) {
      this.logger.error(`getReassignmentQueue error: ${error.message}`);
      return [];
    }
  }
}
