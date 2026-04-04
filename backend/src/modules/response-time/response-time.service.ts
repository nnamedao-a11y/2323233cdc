import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResponseTime, ResponseTimeDocument } from './response-time.schema';
import { CACHE_SERVICE, CacheService } from '../../infrastructure/cache/cache.module';

export interface ResponseTimeMetrics {
  managerId: string;
  period: string;
  avgResponseSeconds: number;
  avgResponseMinutes: number;
  totalEvents: number;
  withinSLA: number;
  outsideSLA: number;
  slaPercentage: number;
  fastestResponse: number;
  slowestResponse: number;
  pendingResponses: number;
}

export interface TeamResponseMetrics {
  teamAvgSeconds: number;
  teamAvgMinutes: number;
  totalEvents: number;
  withinSLAPercentage: number;
  byManager: ResponseTimeMetrics[];
  byEventType: Record<string, { avg: number; count: number; slaPercent: number }>;
  trends: { date: string; avgSeconds: number; count: number }[];
}

@Injectable()
export class ResponseTimeService {
  private readonly logger = new Logger(ResponseTimeService.name);
  
  // SLA settings (in seconds)
  private readonly SLA_SETTINGS = {
    lead_assigned: 300,      // 5 min to first response
    first_call: 600,         // 10 min to make first call
    first_message: 900,      // 15 min to send first message
    callback: 1800,          // 30 min for callbacks
  };

  constructor(
    @InjectModel(ResponseTime.name) private responseTimeModel: Model<ResponseTimeDocument>,
    @Inject(CACHE_SERVICE) private cache: CacheService,
  ) {}

  // === TRACKING EVENTS ===

  async trackLeadAssigned(managerId: string, leadId: string, dealId?: string): Promise<ResponseTime> {
    const record = new this.responseTimeModel({
      managerId,
      leadId,
      dealId,
      eventType: 'lead_assigned',
      triggerTime: new Date(),
      slaSeconds: this.SLA_SETTINGS.lead_assigned,
      isResolved: false,
    });
    
    await record.save();
    this.logger.log(`Tracking response time for lead ${leadId} assigned to manager ${managerId}`);
    return record;
  }

  async trackCallRequired(managerId: string, leadId: string): Promise<ResponseTime> {
    const record = new this.responseTimeModel({
      managerId,
      leadId,
      eventType: 'first_call',
      triggerTime: new Date(),
      slaSeconds: this.SLA_SETTINGS.first_call,
      isResolved: false,
    });
    
    await record.save();
    return record;
  }

  async trackCallbackRequired(managerId: string, leadId: string, callbackTime: Date): Promise<ResponseTime> {
    const record = new this.responseTimeModel({
      managerId,
      leadId,
      eventType: 'callback',
      triggerTime: callbackTime,
      slaSeconds: this.SLA_SETTINGS.callback,
      isResolved: false,
    });
    
    await record.save();
    return record;
  }

  // === RESOLVE EVENTS ===

  async resolveEvent(managerId: string, leadId: string, eventType: string): Promise<ResponseTime | null> {
    const record = await this.responseTimeModel.findOne({
      managerId,
      leadId,
      eventType,
      isResolved: false,
    }).sort({ triggerTime: -1 });

    if (!record) {
      this.logger.warn(`No pending response time record found for ${eventType} on lead ${leadId}`);
      return null;
    }

    const now = new Date();
    const responseSeconds = Math.floor((now.getTime() - record.triggerTime.getTime()) / 1000);
    
    record.responseTime = now;
    record.responseSeconds = responseSeconds;
    record.isWithinSLA = responseSeconds <= record.slaSeconds;
    record.isResolved = true;
    
    await record.save();
    
    this.logger.log(`Response time resolved: ${responseSeconds}s (SLA: ${record.slaSeconds}s, within: ${record.isWithinSLA})`);
    
    // Clear cache
    await this.cache.del(`response-time:manager:${managerId}`);
    await this.cache.del(`response-time:team`);
    
    return record;
  }

  // === METRICS ===

  async getManagerMetrics(managerId: string, days: number = 7): Promise<ResponseTimeMetrics> {
    const cacheKey = `response-time:manager:${managerId}:${days}`;
    
    return this.cache.wrap(cacheKey, async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const records = await this.responseTimeModel.find({
        managerId,
        isResolved: true,
        createdAt: { $gte: startDate },
      });

      const pending = await this.responseTimeModel.countDocuments({
        managerId,
        isResolved: false,
      });

      if (records.length === 0) {
        return {
          managerId,
          period: `${days}d`,
          avgResponseSeconds: 0,
          avgResponseMinutes: 0,
          totalEvents: 0,
          withinSLA: 0,
          outsideSLA: 0,
          slaPercentage: 100,
          fastestResponse: 0,
          slowestResponse: 0,
          pendingResponses: pending,
        };
      }

      const responseTimes = records.map(r => r.responseSeconds || 0);
      const avgSeconds = Math.round(responseTimes.reduce((a, b) => a + b, 0) / records.length);
      const withinSLA = records.filter(r => r.isWithinSLA).length;

      return {
        managerId,
        period: `${days}d`,
        avgResponseSeconds: avgSeconds,
        avgResponseMinutes: Math.round(avgSeconds / 60 * 10) / 10,
        totalEvents: records.length,
        withinSLA,
        outsideSLA: records.length - withinSLA,
        slaPercentage: Math.round((withinSLA / records.length) * 100),
        fastestResponse: Math.min(...responseTimes),
        slowestResponse: Math.max(...responseTimes),
        pendingResponses: pending,
      };
    }, 300); // 5 min cache
  }

  async getTeamMetrics(days: number = 7): Promise<TeamResponseMetrics> {
    const cacheKey = `response-time:team:${days}`;
    
    return this.cache.wrap(cacheKey, async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const records = await this.responseTimeModel.find({
        isResolved: true,
        createdAt: { $gte: startDate },
      });

      if (records.length === 0) {
        return {
          teamAvgSeconds: 0,
          teamAvgMinutes: 0,
          totalEvents: 0,
          withinSLAPercentage: 100,
          byManager: [],
          byEventType: {},
          trends: [],
        };
      }

      // Team averages
      const allTimes = records.map(r => r.responseSeconds || 0);
      const teamAvgSeconds = Math.round(allTimes.reduce((a, b) => a + b, 0) / records.length);
      const withinSLA = records.filter(r => r.isWithinSLA).length;

      // By manager
      const managerIds = [...new Set(records.map(r => r.managerId))];
      const byManager = await Promise.all(
        managerIds.map(id => this.getManagerMetrics(id, days))
      );

      // By event type
      const eventTypes = ['lead_assigned', 'first_call', 'first_message', 'callback'];
      const byEventType: Record<string, { avg: number; count: number; slaPercent: number }> = {};
      
      for (const type of eventTypes) {
        const typeRecords = records.filter(r => r.eventType === type);
        if (typeRecords.length > 0) {
          const times = typeRecords.map(r => r.responseSeconds || 0);
          const typeWithinSLA = typeRecords.filter(r => r.isWithinSLA).length;
          byEventType[type] = {
            avg: Math.round(times.reduce((a, b) => a + b, 0) / typeRecords.length),
            count: typeRecords.length,
            slaPercent: Math.round((typeWithinSLA / typeRecords.length) * 100),
          };
        }
      }

      // Daily trends
      const trends: { date: string; avgSeconds: number; count: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayRecords = records.filter(r => {
          const recordDate = new Date((r as any).createdAt || r.triggerTime).toISOString().split('T')[0];
          return recordDate === dateStr;
        });
        
        if (dayRecords.length > 0) {
          const dayTimes = dayRecords.map(r => r.responseSeconds || 0);
          trends.push({
            date: dateStr,
            avgSeconds: Math.round(dayTimes.reduce((a, b) => a + b, 0) / dayRecords.length),
            count: dayRecords.length,
          });
        } else {
          trends.push({ date: dateStr, avgSeconds: 0, count: 0 });
        }
      }

      return {
        teamAvgSeconds,
        teamAvgMinutes: Math.round(teamAvgSeconds / 60 * 10) / 10,
        totalEvents: records.length,
        withinSLAPercentage: Math.round((withinSLA / records.length) * 100),
        byManager: byManager.sort((a, b) => a.avgResponseSeconds - b.avgResponseSeconds),
        byEventType,
        trends,
      };
    }, 300);
  }

  // === ALERTS ===

  async getPendingAlerts(threshold: number = 300): Promise<ResponseTime[]> {
    const alerts = await this.responseTimeModel.find({
      isResolved: false,
      triggerTime: { $lte: new Date(Date.now() - threshold * 1000) },
    }).sort({ triggerTime: 1 });

    return alerts;
  }

  async getManagerPendingCount(managerId: string): Promise<number> {
    return this.responseTimeModel.countDocuments({
      managerId,
      isResolved: false,
    });
  }
}
