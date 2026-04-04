import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HistoryReport, ReportStatus, ReportProvider } from './history-report.schema';
import { Lead } from '../leads/lead.schema';
import { CallSession } from '../call-flow/call-session.schema';
import { generateId } from '../../shared/utils';

export interface ReportAccessCheck {
  allowed: boolean;
  reason?: string;
  cached?: boolean;
  reportId?: string;
  requiresCall?: boolean;
  requiresApproval?: boolean;
}

export interface RequestReportDto {
  vin: string;
  leadId?: string;
  userId?: string;
  deviceId?: string;
  ipAddress?: string;
}

export interface ApproveReportDto {
  reportId: string;
  managerId: string;
  note?: string;
}

@Injectable()
export class HistoryReportService {
  private readonly logger = new Logger(HistoryReportService.name);
  
  // Cost per report (can be moved to settings)
  private readonly REPORT_COST = 15; // USD
  
  constructor(
    @InjectModel(HistoryReport.name) private reportModel: Model<HistoryReport>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(CallSession.name) private callSessionModel: Model<CallSession>,
  ) {}

  // === CHECK ACCESS ===
  
  async canAccessReport(userId: string, vin: string, deviceId?: string): Promise<ReportAccessCheck> {
    // 1. Check if VIN already has a purchased report (CACHE)
    const cachedReport = await this.reportModel.findOne({
      vin,
      status: { $in: [ReportStatus.PURCHASED, ReportStatus.UNLOCKED] },
    });

    if (cachedReport) {
      return {
        allowed: true,
        cached: true,
        reportId: cachedReport.id,
        reason: 'cached',
      };
    }

    // 2. Check if user has a lead for this VIN
    const lead = await this.leadModel.findOne({
      $or: [
        { 'intentContext.userId': userId },
        { email: { $exists: true } }, // Will match by context
      ],
      vin,
      isDeleted: false,
    });

    if (!lead) {
      return {
        allowed: false,
        reason: 'no_lead',
        requiresCall: true,
      };
    }

    // 3. Check if there was a verified call
    const callSession = await this.callSessionModel.findOne({
      leadId: lead.id,
      status: { $in: ['interested', 'thinking', 'negotiation', 'deal'] },
    });

    if (!callSession) {
      return {
        allowed: false,
        reason: 'call_required',
        requiresCall: true,
      };
    }

    // 4. Check if report was already requested and pending
    const pendingReport = await this.reportModel.findOne({
      vin,
      leadId: lead.id,
      status: ReportStatus.PENDING_APPROVAL,
    });

    if (pendingReport) {
      return {
        allowed: false,
        reason: 'pending_approval',
        reportId: pendingReport.id,
        requiresApproval: true,
      };
    }

    // 5. All checks passed - needs manager approval
    return {
      allowed: true,
      requiresApproval: true,
      reason: 'ready_for_approval',
    };
  }

  // === REQUEST REPORT (USER SIDE) ===
  
  async requestReport(dto: RequestReportDto): Promise<HistoryReport | { error: string }> {
    const { vin, leadId, userId, deviceId, ipAddress } = dto;

    // Check for existing pending/purchased report
    const existing = await this.reportModel.findOne({
      vin,
      status: { $in: [ReportStatus.PENDING_APPROVAL, ReportStatus.APPROVED, ReportStatus.PURCHASED, ReportStatus.UNLOCKED] },
    });

    if (existing) {
      if (existing.status === ReportStatus.PURCHASED || existing.status === ReportStatus.UNLOCKED) {
        return existing; // Return cached
      }
      return { error: 'Report already requested, pending approval' };
    }

    // Create request
    const report = new this.reportModel({
      id: generateId(),
      vin,
      leadId,
      userId,
      deviceId,
      ipAddress,
      status: ReportStatus.PENDING_APPROVAL,
      provider: ReportProvider.CARVERTICAL,
    });

    await report.save();
    this.logger.log(`Report requested for VIN ${vin}, lead ${leadId}`);

    return report;
  }

  // === MANAGER APPROVAL ===
  
  async approveReport(dto: ApproveReportDto): Promise<HistoryReport | { error: string }> {
    const { reportId, managerId, note } = dto;

    const report = await this.reportModel.findOne({ id: reportId });
    if (!report) {
      return { error: 'Report not found' };
    }

    if (report.status !== ReportStatus.PENDING_APPROVAL) {
      return { error: `Report status is ${report.status}, cannot approve` };
    }

    // Verify call was made
    if (report.leadId) {
      const callSession = await this.callSessionModel.findOne({
        leadId: report.leadId,
        status: { $in: ['interested', 'thinking', 'negotiation', 'deal'] },
      });

      if (!callSession) {
        return { error: 'Cannot approve - no verified call with client' };
      }

      report.callVerified = true;
      report.callSessionId = callSession.id;
      report.callDuration = callSession.totalCallDuration;
    }

    report.status = ReportStatus.APPROVED;
    report.approvedAt = new Date();
    report.approvedBy = managerId;
    report.approvalNote = note;
    report.managerId = managerId;

    await report.save();
    this.logger.log(`Report ${reportId} approved by manager ${managerId}`);

    // Auto-purchase after approval
    return this.purchaseReport(reportId);
  }

  // === DENY REPORT ===
  
  async denyReport(reportId: string, managerId: string, reason: string): Promise<HistoryReport | { error: string }> {
    const report = await this.reportModel.findOne({ id: reportId });
    if (!report) {
      return { error: 'Report not found' };
    }

    report.status = ReportStatus.DENIED;
    report.managerId = managerId;
    report.deniedReason = reason;

    await report.save();
    this.logger.log(`Report ${reportId} denied: ${reason}`);

    return report;
  }

  // === PURCHASE REPORT ===
  
  async purchaseReport(reportId: string): Promise<HistoryReport | { error: string }> {
    const report = await this.reportModel.findOne({ id: reportId });
    if (!report) {
      return { error: 'Report not found' };
    }

    if (report.status !== ReportStatus.APPROVED) {
      return { error: 'Report must be approved before purchase' };
    }

    // Check cache first
    const cachedReport = await this.reportModel.findOne({
      vin: report.vin,
      status: { $in: [ReportStatus.PURCHASED, ReportStatus.UNLOCKED] },
      id: { $ne: report.id },
    });

    if (cachedReport) {
      // Use cached data
      report.reportData = cachedReport.reportData;
      report.reportUrl = cachedReport.reportUrl;
      report.status = ReportStatus.UNLOCKED;
      report.isCached = true;
      report.cost = 0;
      await report.save();
      
      this.logger.log(`Report ${reportId} served from cache`);
      return report;
    }

    // TODO: Real CarVertical API call here
    // For now, mock data
    report.reportData = this.generateMockReport(report.vin);
    report.cost = this.REPORT_COST;
    report.status = ReportStatus.PURCHASED;
    
    await report.save();
    this.logger.log(`Report ${reportId} purchased for VIN ${report.vin}, cost: $${report.cost}`);

    return report;
  }

  // === DELIVER TO USER ===
  
  async deliverReport(reportId: string, userId: string): Promise<HistoryReport | { error: string }> {
    const report = await this.reportModel.findOne({ id: reportId });
    if (!report) {
      return { error: 'Report not found' };
    }

    if (report.status !== ReportStatus.PURCHASED && report.status !== ReportStatus.UNLOCKED) {
      return { error: 'Report not ready for delivery' };
    }

    // Check if expired
    if (report.expiresAt && new Date(report.expiresAt) < new Date()) {
      report.status = ReportStatus.EXPIRED;
      await report.save();
      return { error: 'Report has expired. Contact manager for new access.' };
    }

    report.status = ReportStatus.UNLOCKED;
    report.deliveredAt = report.deliveredAt || new Date();
    report.viewCount += 1;
    
    // Set expiration time (72 hours from first delivery)
    this.setExpiration(report);

    // Update lead with history unlocked flag
    if (report.leadId) {
      await this.leadModel.updateOne(
        { id: report.leadId },
        { $set: { historyUnlocked: true, historyReportId: report.id } }
      );
    }

    await report.save();
    return report;
  }

  // === USER CABINET ===
  
  async getUserReports(userId: string): Promise<HistoryReport[]> {
    // First, run expiration check
    await this.expireOldReports();
    
    return this.reportModel.find({
      userId,
      status: { $in: [ReportStatus.UNLOCKED, ReportStatus.PURCHASED, ReportStatus.EXPIRED, ReportStatus.ARCHIVED] },
    }).sort({ createdAt: -1 });
  }

  // === REPORT EXPIRATION LOGIC (48-72h) ===
  
  private readonly EXPIRATION_HOURS = 72; // 72 hours access
  
  async expireOldReports(): Promise<number> {
    const expireTime = new Date(Date.now() - this.EXPIRATION_HOURS * 60 * 60 * 1000);
    
    const result = await this.reportModel.updateMany(
      {
        status: ReportStatus.UNLOCKED,
        deliveredAt: { $lt: expireTime },
      },
      {
        $set: {
          status: ReportStatus.EXPIRED,
        },
      }
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} old reports`);
    }

    return result.modifiedCount;
  }

  // Set expiration when delivering report
  private setExpiration(report: HistoryReport): void {
    if (!report.expiresAt) {
      report.expiresAt = new Date(Date.now() + this.EXPIRATION_HOURS * 60 * 60 * 1000);
    }
  }

  async getReportByVin(vin: string): Promise<HistoryReport | null> {
    return this.reportModel.findOne({
      vin,
      status: { $in: [ReportStatus.UNLOCKED, ReportStatus.PURCHASED] },
    });
  }

  // === MANAGER PENDING QUEUE ===
  
  async getPendingReports(managerId?: string): Promise<HistoryReport[]> {
    const filter: any = { status: ReportStatus.PENDING_APPROVAL };
    
    // If manager, show only their leads' reports
    if (managerId) {
      const leads = await this.leadModel.find({ assignedTo: managerId }).select('id');
      const leadIds = leads.map(l => l.id);
      filter.leadId = { $in: leadIds };
    }

    return this.reportModel.find(filter).sort({ createdAt: 1 });
  }

  // === ANALYTICS ===
  
  async getAnalytics(periodDays: number = 30): Promise<any> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const [
      totalReports,
      purchasedReports,
      cachedReports,
      deniedReports,
      totalCost,
      byManager,
    ] = await Promise.all([
      this.reportModel.countDocuments({ createdAt: { $gte: periodStart } }),
      
      this.reportModel.countDocuments({ 
        status: { $in: [ReportStatus.PURCHASED, ReportStatus.UNLOCKED] },
        createdAt: { $gte: periodStart },
      }),
      
      this.reportModel.countDocuments({ 
        isCached: true,
        createdAt: { $gte: periodStart },
      }),
      
      this.reportModel.countDocuments({ 
        status: ReportStatus.DENIED,
        createdAt: { $gte: periodStart },
      }),
      
      this.reportModel.aggregate([
        { $match: { createdAt: { $gte: periodStart }, cost: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$cost' } } },
      ]).then(r => r[0]?.total || 0),
      
      this.reportModel.aggregate([
        { $match: { createdAt: { $gte: periodStart }, managerId: { $exists: true } } },
        { $group: { _id: '$managerId', count: { $sum: 1 }, cost: { $sum: '$cost' } } },
        { $sort: { cost: -1 } },
      ]),
    ]);

    const cacheHitRate = purchasedReports > 0 ? cachedReports / purchasedReports : 0;
    const approvalRate = totalReports > 0 ? purchasedReports / totalReports : 0;

    return {
      totalReports,
      purchasedReports,
      cachedReports,
      deniedReports,
      totalCost,
      cacheHitRate,
      approvalRate,
      costSaved: cachedReports * this.REPORT_COST,
      byManager,
      periodDays,
    };
  }

  // === MANAGER ABUSE DETECTION ===
  
  async checkManagerAbuse(managerId: string, periodDays: number = 7): Promise<any> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const reports = await this.reportModel.find({
      managerId,
      createdAt: { $gte: periodStart },
    });

    const leadIds = reports.filter(r => r.leadId).map(r => r.leadId);
    
    // Check how many of these leads became deals
    const deals = await this.leadModel.countDocuments({
      id: { $in: leadIds },
      status: 'won',
    });

    const conversionRate = reports.length > 0 ? deals / reports.length : 0;
    const totalCost = reports.reduce((sum, r) => sum + (r.cost || 0), 0);

    const isAbusive = reports.length > 20 && conversionRate < 0.1;

    return {
      managerId,
      reportsCount: reports.length,
      dealsFromReports: deals,
      conversionRate,
      totalCost,
      isAbusive,
      flag: isAbusive ? 'HIGH_SPEND_LOW_CONVERSION' : null,
    };
  }

  // === MOCK REPORT GENERATOR ===
  
  private generateMockReport(vin: string): any {
    return {
      accidents: Math.floor(Math.random() * 3),
      mileageHistory: [
        { date: '2022-01-15', mileage: 45000 },
        { date: '2023-06-20', mileage: 67000 },
        { date: '2024-03-10', mileage: 82000 },
      ],
      ownerCount: Math.floor(Math.random() * 4) + 1,
      damageRecords: Math.random() > 0.7 ? [
        { date: '2023-02-15', type: 'minor', description: 'Front bumper damage' },
      ] : [],
      serviceHistory: [
        { date: '2023-01-10', type: 'oil_change', mileage: 60000 },
        { date: '2024-01-15', type: 'brake_service', mileage: 80000 },
      ],
      titleStatus: Math.random() > 0.9 ? 'salvage' : 'clean',
      lastUpdate: new Date(),
    };
  }
}
