/**
 * BIBI Cars - Owner Dashboard Service
 * Comprehensive analytics for owner
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ScoringService } from '../scoring/scoring.service';
import { JourneyService } from '../journey/journey.service';
import { IntegrationConfigService } from '../integration-config/integration-config.service';

export interface OwnerDashboardResponse {
  funnel: {
    leadsCreated: number;
    contacted: number;
    dealsCreated: number;
    contractsSigned: number;
    paymentsDone: number;
    shipmentsDelivered: number;
  };
  money: {
    totalPaid: number;
    totalUnpaid: number;
    overdueAmount: number;
    avgDealValue: number;
    revenueThisMonth: number;
  };
  operations: {
    activeDeals: number;
    stalledDeals: number;
    activeShipments: number;
    stalledShipments: number;
    criticalShipmentRisk: number;
    pendingContracts: number;
  };
  people: {
    totalManagers: number;
    activeManagers: number;
    topPerformers: any[];
    underperformers: any[];
    overdueTasks: number;
  };
  risk: {
    suspiciousSessions: number;
    criticalInvoices: number;
    riskyShipments: number;
    integrationsDown: number;
  };
  journeyDropOff: any[];
  hotLeads: any[];
  lowHealthDeals: any[];
}

@Injectable()
export class OwnerDashboardService {
  private readonly logger = new Logger(OwnerDashboardService.name);

  constructor(
    private readonly scoringService: ScoringService,
    private readonly journeyService: JourneyService,
    @Inject(forwardRef(() => IntegrationConfigService))
    private readonly integrationConfig: IntegrationConfigService,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Invoice') private invoiceModel: Model<any>,
    @InjectModel('Shipment') private shipmentModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Task') private taskModel: Model<any>,
    @InjectModel('StaffSession') private sessionModel: Model<any>,
  ) {}

  async getDashboard(days = 30): Promise<OwnerDashboardResponse> {
    const [
      funnel,
      money,
      operations,
      people,
      risk,
      journeyDropOff,
      hotLeads,
      lowHealthDeals,
    ] = await Promise.all([
      this.getFunnel(days),
      this.getMoney(days),
      this.getOperations(),
      this.getPeople(),
      this.getRisk(),
      this.getJourneyDropOff(days),
      this.scoringService.getHotLeads(5),
      this.scoringService.getLowHealthDeals(5),
    ]);

    return {
      funnel,
      money,
      operations,
      people,
      risk,
      journeyDropOff,
      hotLeads,
      lowHealthDeals,
    };
  }

  private async getFunnel(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    try {
      const [leads, deals, contracts, payments, deliveries] = await Promise.all([
        this.leadModel.countDocuments({ createdAt: { $gte: since } }).catch(() => 0),
        this.dealModel.countDocuments({ createdAt: { $gte: since } }).catch(() => 0),
        this.dealModel.countDocuments({ contractSigned: true, createdAt: { $gte: since } }).catch(() => 0),
        this.dealModel.countDocuments({ fullPaymentDone: true, createdAt: { $gte: since } }).catch(() => 0),
        this.dealModel.countDocuments({ shipmentDelivered: true, createdAt: { $gte: since } }).catch(() => 0),
      ]);

      // Contacted - leads with at least one call
      const contacted = await this.leadModel.countDocuments({
        createdAt: { $gte: since },
        $or: [{ callAttempts: { $gt: 0 } }, { contactStatus: { $ne: 'new_request' } }],
      }).catch(() => 0);

      return {
        leadsCreated: leads,
        contacted,
        dealsCreated: deals,
        contractsSigned: contracts,
        paymentsDone: payments,
        shipmentsDelivered: deliveries,
      };
    } catch (error) {
      this.logger.error('Error getting funnel stats', error);
      return {
        leadsCreated: 0,
        contacted: 0,
        dealsCreated: 0,
        contractsSigned: 0,
        paymentsDone: 0,
        shipmentsDelivered: 0,
      };
    }
  }

  private async getMoney(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    try {
      const [paidInvoices, unpaidInvoices, overdueInvoices, monthlyRevenue] = await Promise.all([
        this.invoiceModel.aggregate([
          { $match: { status: 'paid', paidAt: { $gte: since } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).catch(() => []),
        this.invoiceModel.aggregate([
          { $match: { status: { $in: ['pending', 'sent'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).catch(() => []),
        this.invoiceModel.aggregate([
          { $match: { status: 'overdue' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).catch(() => []),
        this.invoiceModel.aggregate([
          { $match: { status: 'paid', paidAt: { $gte: monthStart } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).catch(() => []),
      ]);

      const totalPaid = paidInvoices[0]?.total || 0;
      const totalUnpaid = unpaidInvoices[0]?.total || 0;
      const overdueAmount = overdueInvoices[0]?.total || 0;
      const revenueThisMonth = monthlyRevenue[0]?.total || 0;

      // Calculate avg deal value
      const completedDeals = await this.dealModel.countDocuments({
        status: 'won',
        createdAt: { $gte: since },
      }).catch(() => 1);

      return {
        totalPaid,
        totalUnpaid,
        overdueAmount,
        avgDealValue: completedDeals > 0 ? Math.round(totalPaid / completedDeals) : 0,
        revenueThisMonth,
      };
    } catch (error) {
      this.logger.error('Error getting money stats', error);
      return {
        totalPaid: 0,
        totalUnpaid: 0,
        overdueAmount: 0,
        avgDealValue: 0,
        revenueThisMonth: 0,
      };
    }
  }

  private async getOperations() {
    try {
      const [activeDeals, stalledDeals, activeShipments, stalledShipments, criticalShipments, pendingContracts] = await Promise.all([
        this.dealModel.countDocuments({ status: { $in: ['new', 'in_progress'] } }).catch(() => 0),
        this.dealModel.countDocuments({
          status: { $in: ['new', 'in_progress'] },
          updatedAt: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        }).catch(() => 0),
        this.shipmentModel.countDocuments({ currentStatus: { $nin: ['delivered', 'cancelled'] } }).catch(() => 0),
        this.shipmentModel.countDocuments({ currentStatus: 'stalled' }).catch(() => 0),
        this.scoringService.getCriticalShipments(100).then(s => s.length).catch(() => 0),
        this.dealModel.countDocuments({ stage: 'CONTRACT_SENT', contractSigned: false }).catch(() => 0),
      ]);

      return {
        activeDeals,
        stalledDeals,
        activeShipments,
        stalledShipments,
        criticalShipmentRisk: criticalShipments,
        pendingContracts,
      };
    } catch (error) {
      this.logger.error('Error getting operations stats', error);
      return {
        activeDeals: 0,
        stalledDeals: 0,
        activeShipments: 0,
        stalledShipments: 0,
        criticalShipmentRisk: 0,
        pendingContracts: 0,
      };
    }
  }

  private async getPeople() {
    try {
      const [topPerformers, underperformers, totalManagers, activeManagers, overdueTasks] = await Promise.all([
        this.scoringService.getTopManagers(3),
        this.scoringService.getWeakManagers(3),
        // Staff count
        this.userModel.countDocuments({ role: { $in: ['manager', 'team_lead'] } }).catch(() => 0),
        // Active managers (logged in within 7 days)
        this.userModel.countDocuments({ 
          role: { $in: ['manager', 'team_lead'] },
          lastLoginAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }).catch(() => 0),
        // Overdue tasks
        this.taskModel.countDocuments({
          status: { $ne: 'completed' },
          dueDate: { $lt: new Date() },
        }).catch(() => 0),
      ]);

      return {
        totalManagers,
        activeManagers,
        topPerformers,
        underperformers,
        overdueTasks,
      };
    } catch (error) {
      this.logger.error('Error getting people stats', error);
      return {
        totalManagers: 0,
        activeManagers: 0,
        topPerformers: [],
        underperformers: [],
        overdueTasks: 0,
      };
    }
  }

  private async getRisk() {
    try {
      const [criticalInvoices, riskyShipments, suspiciousSessions, integrationsHealth] = await Promise.all([
        this.invoiceModel.countDocuments({ status: 'overdue' }).catch(() => 0),
        this.scoringService.getCriticalShipments(100).then(s => s.filter(sh => sh.band === 'critical').length).catch(() => 0),
        // Suspicious sessions (multiple IPs for same user within 1 hour)
        this.getSuspiciousSessions(),
        // Integration health checks
        this.getIntegrationDownCount(),
      ]);

      return {
        suspiciousSessions,
        criticalInvoices,
        riskyShipments,
        integrationsDown: integrationsHealth,
      };
    } catch (error) {
      this.logger.error('Error getting risk stats', error);
      return {
        suspiciousSessions: 0,
        criticalInvoices: 0,
        riskyShipments: 0,
        integrationsDown: 0,
      };
    }
  }

  private async getSuspiciousSessions(): Promise<number> {
    try {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // Find users with multiple different IPs in the last hour
      const suspicious = await this.sessionModel.aggregate([
        { $match: { createdAt: { $gte: hourAgo }, isActive: true } },
        { $group: { _id: '$userId', ips: { $addToSet: '$ip' } } },
        { $match: { 'ips.1': { $exists: true } } }, // More than 1 unique IP
      ]);

      return suspicious.length;
    } catch (error) {
      return 0;
    }
  }

  private async getIntegrationDownCount(): Promise<number> {
    try {
      // Check configured integrations health
      const providers = ['stripe', 'docusign', 'telegram', 'twilio', 'email'];
      let downCount = 0;

      for (const provider of providers) {
        try {
          const config = await this.integrationConfig.getConfig(provider as any);
          if (config?.isEnabled) {
            const health = await this.integrationConfig.testConnection(provider as any);
            if (!health?.success) {
              downCount++;
            }
          }
        } catch {
          // Skip if error
        }
      }

      return downCount;
    } catch (error) {
      return 0;
    }
  }

  private async getJourneyDropOff(days: number) {
    try {
      const funnelStats = await this.journeyService.getFunnelStats(days);
      return funnelStats.dropOff || [];
    } catch (error) {
      this.logger.error('Error getting journey drop-off', error);
      return [];
    }
  }
}
