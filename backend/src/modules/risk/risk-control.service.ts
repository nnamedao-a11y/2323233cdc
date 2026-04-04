/**
 * Risk & Abuse Control Service
 * 
 * Monitors:
 * 1. User abuse (too many VIN requests, no conversion)
 * 2. Manager abuse (Carfax usage, low productivity)
 * 3. Session anomalies (new device, weird IP, concurrent sessions)
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AlertEventType } from '../alerts/alert-event.schema';

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface RiskAssessment {
  entityId: string;
  entityType: 'user' | 'manager' | 'session';
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  factors: Array<{ name: string; weight: number; description: string }>;
  recommendations: string[];
  timestamp: Date;
}

@Injectable()
export class RiskControlService {
  private readonly logger = new Logger(RiskControlService.name);

  constructor(
    @InjectModel('CarfaxRequest') private carfaxModel: Model<any>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Call') private callModel: Model<any>,
    @InjectModel('Task') private taskModel: Model<any>,
    @InjectModel('StaffSession') private sessionModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Customer') private customerModel: Model<any>,
    private alertsService: AlertsService,
  ) {}

  // === USER ABUSE DETECTION ===

  async assessUserRisk(userId: string): Promise<RiskAssessment> {
    const factors: Array<{ name: string; weight: number; description: string }> = [];
    let riskScore = 0;
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Factor 1: Too many VIN/Carfax requests
    const carfaxRequests = await this.carfaxModel.countDocuments({
      customerId: userId,
      createdAt: { $gte: last7Days },
    });

    if (carfaxRequests > 10) {
      const weight = Math.min((carfaxRequests - 10) * 3, 30);
      factors.push({ name: 'excessive_carfax', weight, description: `${carfaxRequests} Carfax requests in 7 days` });
      riskScore += weight;
    }

    // Factor 2: Carfax requests without conversion
    const userDeals = await this.dealModel.countDocuments({
      customerId: userId,
      status: { $in: ['won', 'in_progress'] },
    });

    if (carfaxRequests > 3 && userDeals === 0) {
      const weight = 25;
      factors.push({ name: 'no_conversion', weight, description: 'Multiple Carfax requests, no deal progression' });
      riskScore += weight;
    }

    // Factor 3: Multiple accounts pattern (same phone/email patterns)
    const customer = await this.customerModel.findOne({ id: userId }).lean() as any;
    if (customer?.phone) {
      const similarCustomers = await this.customerModel.countDocuments({
        phone: { $regex: String(customer.phone).slice(-8) }, // Last 8 digits
        id: { $ne: userId },
      });
      
      if (similarCustomers > 0) {
        const weight = 20;
        factors.push({ name: 'multiple_accounts', weight, description: `${similarCustomers} similar phone numbers found` });
        riskScore += weight;
      }
    }

    // Factor 4: Rapid requests pattern
    const recentRequests = await this.carfaxModel.countDocuments({
      customerId: userId,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    });

    if (recentRequests > 3) {
      const weight = 15;
      factors.push({ name: 'rapid_requests', weight, description: `${recentRequests} requests in last hour` });
      riskScore += weight;
    }

    const riskLevel = this.getRiskLevel(riskScore);
    const recommendations = this.getRecommendations(factors, 'user');

    // Alert if high risk
    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL) {
      const customer = await this.customerModel.findOne({ id: userId }).lean() as any;
      await this.alertsService.sendAlert({
        eventType: AlertEventType.CARFAX_ABUSE_DETECTED,
        metadata: {
          userId,
          userName: customer?.name || 'Unknown',
          requestCount: carfaxRequests,
          riskScore,
          factors: factors.map(f => f.name),
        },
      });
    }

    return {
      entityId: userId,
      entityType: 'user',
      riskScore,
      riskLevel,
      factors,
      recommendations,
      timestamp: new Date(),
    };
  }

  // === MANAGER ABUSE DETECTION ===

  async assessManagerRisk(managerId: string): Promise<RiskAssessment> {
    const factors: Array<{ name: string; weight: number; description: string }> = [];
    let riskScore = 0;
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Factor 1: High Carfax usage with low conversion
    const carfaxUploads = await this.carfaxModel.countDocuments({
      managerId,
      status: 'uploaded',
      createdAt: { $gte: last7Days },
    });

    const dealsFromCarfax = await this.dealModel.countDocuments({
      managerId,
      hasCarfax: true,
      status: 'won',
      createdAt: { $gte: last7Days },
    });

    if (carfaxUploads > 5 && dealsFromCarfax === 0) {
      const weight = 25;
      factors.push({ name: 'carfax_no_conversion', weight, description: `${carfaxUploads} Carfax uploads, 0 deals` });
      riskScore += weight;
    }

    // Factor 2: Not calling hot leads
    const hotLeads = await this.leadModel.countDocuments({
      assignedTo: managerId,
      temperature: 'hot',
      lastCallAt: null,
      createdAt: { $gte: last7Days },
    });

    if (hotLeads > 0) {
      const weight = Math.min(hotLeads * 10, 30);
      factors.push({ name: 'hot_leads_not_called', weight, description: `${hotLeads} hot leads not called` });
      riskScore += weight;
    }

    // Factor 3: Too many overdue tasks
    const overdueTasks = await this.taskModel.countDocuments({
      assignedTo: managerId,
      status: { $nin: ['completed', 'cancelled'] },
      dueDate: { $lt: new Date() },
    });

    if (overdueTasks > 5) {
      const weight = Math.min((overdueTasks - 5) * 5, 25);
      factors.push({ name: 'overdue_tasks', weight, description: `${overdueTasks} overdue tasks` });
      riskScore += weight;
    }

    // Factor 4: Low call activity
    const calls = await this.callModel.countDocuments({
      managerId,
      startedAt: { $gte: last7Days },
    });

    if (calls < 10) {
      const weight = Math.max(20 - calls * 2, 0);
      factors.push({ name: 'low_call_activity', weight, description: `Only ${calls} calls in 7 days` });
      riskScore += weight;
    }

    // Factor 5: Sessions but no activity
    const sessions = await this.sessionModel.countDocuments({
      userId: managerId,
      createdAt: { $gte: last7Days },
    });

    const totalActivity = calls + overdueTasks + carfaxUploads;
    if (sessions > 5 && totalActivity < 5) {
      const weight = 15;
      factors.push({ name: 'sessions_no_activity', weight, description: `${sessions} logins, minimal activity` });
      riskScore += weight;
    }

    const riskLevel = this.getRiskLevel(riskScore);
    const recommendations = this.getRecommendations(factors, 'manager');

    // Alert if problematic
    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL) {
      const manager = await this.userModel.findOne({ id: managerId }).lean() as any;
      await this.alertsService.sendAlert({
        eventType: AlertEventType.MANAGER_PERFORMANCE_LOW,
        metadata: {
          managerId,
          managerName: manager ? `${manager.firstName || ''} ${manager.lastName || ''}`.trim() : 'Unknown',
          riskScore,
          activeTasks: overdueTasks,
          lastActivity: 'Low',
        },
      });
    }

    return {
      entityId: managerId,
      entityType: 'manager',
      riskScore,
      riskLevel,
      factors,
      recommendations,
      timestamp: new Date(),
    };
  }

  // === SESSION ANOMALY DETECTION ===

  async assessSessionRisk(sessionId: string, userId: string, ip: string, userAgent: string): Promise<RiskAssessment> {
    const factors: Array<{ name: string; weight: number; description: string }> = [];
    let riskScore = 0;

    // Get user's previous sessions
    const previousSessions = await this.sessionModel.find({
      userId,
      id: { $ne: sessionId },
    }).sort({ createdAt: -1 }).limit(10).lean();

    // Factor 1: New IP
    const knownIPs = new Set(previousSessions.map(s => s.ip));
    if (!knownIPs.has(ip) && knownIPs.size > 0) {
      const weight = 30;
      factors.push({ name: 'new_ip', weight, description: `New IP address: ${ip}` });
      riskScore += weight;
    }

    // Factor 2: New device
    const knownDevices = new Set(previousSessions.map(s => s.userAgent));
    if (!knownDevices.has(userAgent) && knownDevices.size > 0) {
      const weight = 25;
      factors.push({ name: 'new_device', weight, description: 'Unknown device detected' });
      riskScore += weight;
    }

    // Factor 3: Concurrent sessions
    const activeSessions = await this.sessionModel.countDocuments({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (activeSessions > 2) {
      const weight = 20;
      factors.push({ name: 'concurrent_sessions', weight, description: `${activeSessions} active sessions` });
      riskScore += weight;
    }

    // Factor 4: Rapid successive logins
    const recentLogins = await this.sessionModel.countDocuments({
      userId,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });

    if (recentLogins > 3) {
      const weight = 15;
      factors.push({ name: 'rapid_logins', weight, description: `${recentLogins} logins in last hour` });
      riskScore += weight;
    }

    const riskLevel = this.getRiskLevel(riskScore);
    const recommendations = this.getRecommendations(factors, 'session');

    // Alert if suspicious
    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL) {
      const user = await this.userModel.findOne({ id: userId }).lean() as any;
      await this.alertsService.sendAlert({
        eventType: AlertEventType.MANAGER_LOGIN_SUSPICIOUS,
        metadata: {
          userId,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown',
          ip,
          device: userAgent.slice(0, 50),
          factors: factors.map(f => f.name),
        },
      });
    }

    return {
      entityId: sessionId,
      entityType: 'session',
      riskScore,
      riskLevel,
      factors,
      recommendations,
      timestamp: new Date(),
    };
  }

  // === HELPERS ===

  private getRiskLevel(score: number): RiskLevel {
    if (score >= 70) return RiskLevel.CRITICAL;
    if (score >= 50) return RiskLevel.HIGH;
    if (score >= 30) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  private getRecommendations(factors: Array<{ name: string }>, entityType: string): string[] {
    const recommendations: string[] = [];
    const factorNames = factors.map(f => f.name);

    if (entityType === 'user') {
      if (factorNames.includes('excessive_carfax')) {
        recommendations.push('Review user activity and consider contact');
      }
      if (factorNames.includes('no_conversion')) {
        recommendations.push('Manual review recommended - potential abuse');
      }
      if (factorNames.includes('multiple_accounts')) {
        recommendations.push('Check for duplicate accounts');
      }
    }

    if (entityType === 'manager') {
      if (factorNames.includes('hot_leads_not_called')) {
        recommendations.push('Reassign hot leads or contact manager');
      }
      if (factorNames.includes('overdue_tasks')) {
        recommendations.push('Review task workload and prioritization');
      }
      if (factorNames.includes('carfax_no_conversion')) {
        recommendations.push('Review Carfax usage policy with manager');
      }
    }

    if (entityType === 'session') {
      if (factorNames.includes('new_ip') || factorNames.includes('new_device')) {
        recommendations.push('Verify session with user');
      }
      if (factorNames.includes('concurrent_sessions')) {
        recommendations.push('Consider terminating extra sessions');
      }
    }

    return recommendations;
  }

  // === BATCH RISK ASSESSMENT ===

  async runDailyRiskAssessment(): Promise<any> {
    this.logger.log('Starting daily risk assessment...');

    // Assess all active managers
    const managers = await this.userModel.find({ role: 'manager', isActive: true }).lean();
    const managerRisks = await Promise.all(
      managers.map(m => this.assessManagerRisk(m.id))
    );

    const highRiskManagers = managerRisks.filter(r => r.riskLevel === RiskLevel.HIGH || r.riskLevel === RiskLevel.CRITICAL);

    // Assess recent customers with activity
    const recentCustomers = await this.customerModel.find({
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }).limit(100).lean();

    const customerRisks = await Promise.all(
      recentCustomers.map(c => this.assessUserRisk(c.id))
    );

    const highRiskCustomers = customerRisks.filter(r => r.riskLevel === RiskLevel.HIGH || r.riskLevel === RiskLevel.CRITICAL);

    this.logger.log(`Daily risk assessment complete: ${highRiskManagers.length} high-risk managers, ${highRiskCustomers.length} high-risk customers`);

    return {
      timestamp: new Date(),
      managersAssessed: managers.length,
      highRiskManagers: highRiskManagers.length,
      customersAssessed: recentCustomers.length,
      highRiskCustomers: highRiskCustomers.length,
    };
  }
}
