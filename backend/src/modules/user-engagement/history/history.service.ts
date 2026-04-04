/**
 * History Service
 * 
 * Головний сервіс для history reports
 * Включає: cache, quota, risk assessment, provider integration
 */

import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { VehicleHistoryRequest, VehicleHistoryRequestDocument } from './schemas/vehicle-history-request.schema';
import { VehicleHistoryReport, VehicleHistoryReportDocument } from './schemas/vehicle-history-report.schema';
import { Model } from 'mongoose';
import { HistoryProviderService } from './history-provider.service';
import { HistoryRiskService } from './history-risk.service';
import { HistoryQuotaService } from './history-quota.service';

// Cache duration: 7 днів
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectModel(VehicleHistoryRequest.name)
    private readonly requestModel: Model<VehicleHistoryRequestDocument>,
    @InjectModel(VehicleHistoryReport.name)
    private readonly reportModel: Model<VehicleHistoryReportDocument>,
    private readonly provider: HistoryProviderService,
    private readonly risk: HistoryRiskService,
    private readonly quota: HistoryQuotaService,
  ) {}

  /**
   * Запит history report
   * 
   * Flow:
   * 1. Перевірка кешу
   * 2. Risk assessment
   * 3. Quota check
   * 4. Provider call
   * 5. Cache result
   */
  async request(
    user: any,
    vin: string,
    deviceFingerprint: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{
    cached: boolean;
    report: VehicleHistoryReport;
    quota: any;
  }> {
    const normalizedVin = vin.trim().toUpperCase();
    const userId = user.id || user._id?.toString();

    this.logger.log(`[History] Request from user ${userId} for VIN ${normalizedVin}`);

    // Step 1: Перевірка кешу
    const cached = await this.reportModel.findOne({
      vin: normalizedVin,
      expiresAt: { $gt: new Date() },
    });

    if (cached) {
      this.logger.log(`[History] Cache hit for ${normalizedVin}`);
      
      // Логуємо cached request
      await this.requestModel.create({
        userId,
        vin: normalizedVin,
        provider: cached.provider,
        status: 'cached',
        reportId: cached._id?.toString(),
        deviceFingerprint,
        ip,
        userAgent,
      });

      // Інкремент view count
      await this.reportModel.updateOne(
        { _id: cached._id },
        { $inc: { viewCount: 1 } },
      );

      const quotaInfo = await this.quota.getQuota(userId);
      return { cached: true, report: cached, quota: quotaInfo };
    }

    // Step 2: Risk assessment
    const riskResult = await this.risk.score(userId, normalizedVin, deviceFingerprint);
    
    if (this.risk.shouldBlock(riskResult.score)) {
      this.logger.warn(`[History] BLOCKED user ${userId}: score=${riskResult.score}`);
      
      await this.requestModel.create({
        userId,
        vin: normalizedVin,
        provider: 'blocked',
        status: 'blocked',
        reason: `risk_score: ${riskResult.score}`,
        riskScore: riskResult.score,
        deviceFingerprint,
        ip,
        userAgent,
      });

      await this.risk.incrementAbuseFlags(userId);

      throw new ForbiddenException(
        'Request blocked due to suspicious activity. Please contact support.',
      );
    }

    // Step 3: Quota check
    const quotaCheck = await this.quota.canUseFreeReport(userId);
    
    if (!quotaCheck.canUse) {
      this.logger.log(`[History] Quota exhausted for user ${userId}: ${quotaCheck.reason}`);
      throw new ForbiddenException(quotaCheck.reason);
    }

    // Step 4: Create pending request
    const request = await this.requestModel.create({
      userId,
      vin: normalizedVin,
      provider: 'pending',
      status: 'pending',
      riskScore: riskResult.score,
      deviceFingerprint,
      ip,
      userAgent,
    });

    // Step 5: Provider call
    try {
      const result = await this.provider.fetchReport(normalizedVin);

      // Step 6: Cache result
      const report = await this.reportModel.create({
        vin: normalizedVin,
        provider: result.provider,
        rawData: result.rawData,
        normalizedData: result.normalizedData,
        fetchedByUserId: userId,
        expiresAt: new Date(Date.now() + CACHE_DURATION_MS),
        viewCount: 1,
      });

      // Update request
      request.status = 'success';
      request.provider = result.provider;
      request.reportId = report._id?.toString();
      request.cost = result.cost || 0;
      await request.save();

      // Increment quota
      await this.quota.incrementFree(userId);

      const quotaInfo = await this.quota.getQuota(userId);

      this.logger.log(`[History] SUCCESS for ${normalizedVin}, cost=${result.cost}`);
      return { cached: false, report, quota: quotaInfo };

    } catch (error: any) {
      request.status = 'failed';
      request.reason = error.message || 'provider_failed';
      await request.save();

      this.logger.error(`[History] Provider failed for ${normalizedVin}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Отримати report по VIN (якщо є в кеші)
   */
  async getReportByVin(userId: string, vin: string): Promise<VehicleHistoryReport> {
    const normalizedVin = vin.trim().toUpperCase();
    
    const report = await this.reportModel.findOne({
      vin: normalizedVin,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!report) {
      throw new NotFoundException('Report not found or expired');
    }

    return report;
  }

  /**
   * Отримати quota користувача
   */
  async getMyQuota(userId: string) {
    return this.quota.getQuota(userId);
  }

  /**
   * Admin: Всі requests
   */
  async adminRequests(page = 1, limit = 100) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.requestModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.requestModel.countDocuments(),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Admin: Всі reports
   */
  async adminReports(page = 1, limit = 100) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.reportModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.reportModel.countDocuments(),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Admin: Аналітика
   */
  async adminAnalytics() {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Requests stats
    const [totalRequests, successRequests, blockedRequests, cachedRequests] = await Promise.all([
      this.requestModel.countDocuments(),
      this.requestModel.countDocuments({ status: 'success' }),
      this.requestModel.countDocuments({ status: 'blocked' }),
      this.requestModel.countDocuments({ status: 'cached' }),
    ]);

    // Last 24h
    const requests24h = await this.requestModel.countDocuments({
      createdAt: { $gte: new Date(now - day) },
    });

    // Cost stats
    const costAgg = await this.requestModel.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: null, totalCost: { $sum: '$cost' } } },
    ]);

    // Top abusers
    const topAbusers = await this.requestModel.aggregate([
      { $match: { status: 'blocked' } },
      { $group: { _id: '$userId', blockedCount: { $sum: 1 } } },
      { $sort: { blockedCount: -1 } },
      { $limit: 10 },
    ]);

    // Top VINs
    const topVins = await this.requestModel.aggregate([
      { $group: { _id: '$vin', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    return {
      requests: {
        total: totalRequests,
        success: successRequests,
        blocked: blockedRequests,
        cached: cachedRequests,
        last24h: requests24h,
      },
      costs: {
        total: costAgg[0]?.totalCost || 0,
      },
      topAbusers,
      topVins,
    };
  }

  /**
   * Admin: Approve blocked request manually
   */
  async adminApprove(requestId: string) {
    const request = await this.requestModel.findById(requestId);
    if (!request) throw new NotFoundException('Request not found');

    // Викликаємо provider вручну
    const result = await this.provider.fetchReport(request.vin);

    const report = await this.reportModel.create({
      vin: request.vin,
      provider: result.provider,
      rawData: result.rawData,
      normalizedData: result.normalizedData,
      fetchedByUserId: request.userId,
      expiresAt: new Date(Date.now() + CACHE_DURATION_MS),
    });

    request.status = 'success';
    request.provider = result.provider;
    request.reportId = report._id?.toString();
    request.reason = 'admin_approved';
    await request.save();

    return { success: true, report };
  }

  /**
   * Admin: Block user
   */
  async adminBlockUser(userId: string, reason: string) {
    await this.quota.restrict(userId, reason);
    return { success: true };
  }

  /**
   * Admin: Unblock user
   */
  async adminUnblockUser(userId: string) {
    await this.quota.unrestrict(userId);
    return { success: true };
  }
}
