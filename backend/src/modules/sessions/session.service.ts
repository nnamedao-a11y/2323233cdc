/**
 * Session Service
 * 
 * Manages user sessions with:
 * - Session creation on login
 * - Suspicious activity detection
 * - Session termination
 * - Activity tracking
 */

import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Session, SessionDocument } from './session.schema';
import { CriticalAlertService } from '../alerts/critical-alert.service';
import { UAParser } from 'ua-parser-js';

export interface CreateSessionInput {
  userId: string;
  role: string;
  email?: string;
  fullName?: string;
  ip: string;
  userAgent: string;
}

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly logger = new Logger(SessionService.name);
  private uaParser = new UAParser();

  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @Inject(forwardRef(() => CriticalAlertService))
    private alertService: CriticalAlertService,
  ) {}

  async onModuleInit() {
    this.logger.log('Session Service initialized');
  }

  /**
   * Create new session on login
   */
  async createSession(input: CreateSessionInput): Promise<Session> {
    // Parse user agent
    this.uaParser.setUA(input.userAgent);
    const ua = this.uaParser.getResult();

    const session = new this.sessionModel({
      userId: input.userId,
      role: input.role,
      email: input.email,
      fullName: input.fullName,
      ip: input.ip,
      userAgent: input.userAgent,
      device: ua.device.model || ua.device.type || 'Desktop',
      browser: `${ua.browser.name || 'Unknown'} ${ua.browser.version || ''}`.trim(),
      os: `${ua.os.name || 'Unknown'} ${ua.os.version || ''}`.trim(),
      isActive: true,
      lastActivityAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    await session.save();

    // Check for suspicious activity
    await this.detectSuspiciousActivity(input.userId, input.ip, input.role);

    // Alert for manager login
    if (['manager', 'MANAGER'].includes(input.role)) {
      await this.alertService.managerLogin(
        input.userId,
        input.fullName || input.email || input.userId,
        input.ip,
      );
    }

    this.logger.log(`Session created for ${input.email} from ${input.ip}`);
    return session;
  }

  /**
   * Detect suspicious activity (multiple IPs)
   */
  private async detectSuspiciousActivity(userId: string, currentIp: string, role: string): Promise<void> {
    const activeSessions = await this.sessionModel.find({
      userId,
      isActive: true,
      ip: { $ne: currentIp },
    });

    if (activeSessions.length > 0) {
      const ips = [currentIp, ...activeSessions.map(s => s.ip)];
      const uniqueIps = [...new Set(ips)];

      if (uniqueIps.length >= 2) {
        // Mark all sessions as suspicious
        await this.sessionModel.updateMany(
          { userId, isActive: true },
          { $set: { isSuspicious: true, suspiciousReason: `Multiple IPs: ${uniqueIps.join(', ')}` } },
        );

        // Alert owner
        const session = activeSessions[0];
        await this.alertService.suspiciousLogin(
          userId,
          session.fullName || session.email || userId,
          currentIp,
          `User logged in from ${uniqueIps.length} different IPs simultaneously`,
        );

        this.logger.warn(`Suspicious activity detected for user ${userId}: ${uniqueIps.length} IPs`);
      }
    }
  }

  /**
   * Update session activity
   */
  async updateActivity(userId: string, ip?: string): Promise<void> {
    await this.sessionModel.updateMany(
      { userId, isActive: true },
      { $set: { lastActivityAt: new Date() } },
    );
  }

  /**
   * Terminate session
   */
  async terminateSession(sessionId: string, terminatedBy: string, reason?: string): Promise<boolean> {
    const result = await this.sessionModel.updateOne(
      { _id: sessionId },
      {
        $set: {
          isActive: false,
          terminatedAt: new Date(),
          terminatedBy,
          terminationReason: reason || 'Admin terminated',
        },
      },
    );

    this.logger.log(`Session ${sessionId} terminated by ${terminatedBy}`);
    return result.modifiedCount > 0;
  }

  /**
   * Terminate all sessions for user
   */
  async terminateUserSessions(userId: string, terminatedBy: string): Promise<number> {
    const result = await this.sessionModel.updateMany(
      { userId, isActive: true },
      {
        $set: {
          isActive: false,
          terminatedAt: new Date(),
          terminatedBy,
          terminationReason: 'All sessions terminated',
        },
      },
    );

    this.logger.log(`Terminated ${result.modifiedCount} sessions for user ${userId}`);
    return result.modifiedCount;
  }

  /**
   * Get all sessions (admin)
   */
  async getAllSessions(filters?: { role?: string; isActive?: boolean }): Promise<Session[]> {
    const query: any = {};
    
    if (filters?.role) query.role = filters.role;
    if (typeof filters?.isActive === 'boolean') query.isActive = filters.isActive;

    return this.sessionModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    totalActive: number;
    byRole: Record<string, number>;
    suspicious: number;
  }> {
    const [totalActive, suspicious, byRoleAgg] = await Promise.all([
      this.sessionModel.countDocuments({ isActive: true }),
      this.sessionModel.countDocuments({ isActive: true, isSuspicious: true }),
      this.sessionModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
    ]);

    const byRole: Record<string, number> = {};
    for (const item of byRoleAgg) {
      byRole[item._id] = item.count;
    }

    return { totalActive, byRole, suspicious };
  }

  /**
   * Daily reset for manager sessions
   */
  @Cron('0 0 * * *') // Midnight every day
  async resetManagerSessions(): Promise<void> {
    const result = await this.sessionModel.updateMany(
      { role: { $in: ['manager', 'MANAGER'] }, isActive: true },
      {
        $set: {
          isActive: false,
          terminatedAt: new Date(),
          terminationReason: 'Daily session reset',
        },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Daily reset: ${result.modifiedCount} manager sessions terminated`);
    }
  }

  /**
   * Cleanup expired sessions
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions(): Promise<void> {
    const result = await this.sessionModel.updateMany(
      { isActive: true, expiresAt: { $lt: new Date() } },
      {
        $set: {
          isActive: false,
          terminatedAt: new Date(),
          terminationReason: 'Session expired',
        },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Cleanup: ${result.modifiedCount} expired sessions terminated`);
    }
  }
}
