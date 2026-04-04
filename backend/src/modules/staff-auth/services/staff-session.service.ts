import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { StaffSession, StaffSessionDocument } from '../schemas/staff-session.schema';
import { SecuritySettingsService } from './security-settings.service';

export interface CreateSessionInput {
  userId: string;
  email: string;
  role: string;
  teamLeadId?: string;
  ip: string;
  userAgent: string;
  deviceId: string;
  deviceName?: string;
  approvedByUserId?: string;
}

@Injectable()
export class StaffSessionService {
  private readonly logger = new Logger(StaffSessionService.name);

  constructor(
    @InjectModel(StaffSession.name)
    private readonly sessionModel: Model<StaffSessionDocument>,
    private readonly settingsService: SecuritySettingsService,
  ) {}

  async createSession(input: CreateSessionInput): Promise<StaffSession> {
    const settings = await this.settingsService.getSettings();
    
    // Enforce session limit
    await this.enforceSessionLimit(input.userId, settings.sessionLimitPerUser);

    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + settings.sessionLifetimeHours * 60 * 60 * 1000);

    const session = await this.sessionModel.create({
      userId: input.userId,
      email: input.email,
      role: input.role,
      teamLeadId: input.teamLeadId,
      ip: input.ip,
      userAgent: input.userAgent,
      deviceId: input.deviceId,
      deviceName: input.deviceName || this.parseDeviceName(input.userAgent),
      sessionToken,
      status: 'active',
      lastSeenAt: new Date(),
      expiresAt,
      approvedByUserId: input.approvedByUserId,
    });

    this.logger.log(`✅ Session created for ${input.email} (${input.role})`);
    return session;
  }

  private async enforceSessionLimit(userId: string, limit: number): Promise<void> {
    const activeSessions = await this.sessionModel
      .find({ userId, status: 'active' })
      .sort({ createdAt: 1 });

    if (activeSessions.length >= limit) {
      const toTerminate = activeSessions.slice(0, activeSessions.length - limit + 1);
      
      for (const session of toTerminate) {
        await this.terminateSession(session.sessionToken, 'system', 'session_limit_exceeded');
      }
      
      this.logger.log(`⚠️ Terminated ${toTerminate.length} old sessions for user ${userId} (limit: ${limit})`);
    }
  }

  async validateSession(sessionToken: string): Promise<StaffSession | null> {
    const session = await this.sessionModel.findOne({ 
      sessionToken, 
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (!session) return null;

    // Check inactivity timeout
    const settings = await this.settingsService.getSettings();
    const inactivityLimit = settings.inactivityTimeoutMinutes * 60 * 1000;
    
    if (session.lastSeenAt && 
        Date.now() - session.lastSeenAt.getTime() > inactivityLimit) {
      await this.terminateSession(sessionToken, 'system', 'inactivity_timeout');
      return null;
    }

    return session;
  }

  async touchSession(sessionToken: string): Promise<void> {
    await this.sessionModel.updateOne(
      { sessionToken, status: 'active' },
      { $set: { lastSeenAt: new Date() } },
    );
  }

  async terminateSession(
    sessionToken: string,
    terminatedByUserId: string,
    reason: string = 'manual_termination',
  ): Promise<StaffSession> {
    const session = await this.sessionModel.findOne({ sessionToken });
    
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'active') {
      throw new ForbiddenException('Session already terminated');
    }

    const updated = await this.sessionModel.findOneAndUpdate(
      { sessionToken },
      {
        $set: {
          status: 'terminated',
          terminatedAt: new Date(),
          terminatedByUserId,
          terminateReason: reason,
        },
      },
      { new: true },
    );

    this.logger.log(`🚫 Session terminated: ${session.email} - ${reason}`);
    return updated!;
  }

  async terminateAllUserSessions(userId: string, terminatedByUserId: string, reason: string): Promise<number> {
    const result = await this.sessionModel.updateMany(
      { userId, status: 'active' },
      {
        $set: {
          status: 'terminated',
          terminatedAt: new Date(),
          terminatedByUserId,
          terminateReason: reason,
        },
      },
    );
    return result.modifiedCount;
  }

  // === QUERIES FOR ADMIN PANEL ===

  async getActiveSessions(): Promise<StaffSession[]> {
    return this.sessionModel
      .find({ status: 'active', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 });
  }

  async getSessionsForOwner(): Promise<StaffSession[]> {
    return this.getActiveSessions();
  }

  async getSessionsForTeamLead(teamLeadId: string): Promise<StaffSession[]> {
    return this.sessionModel
      .find({ 
        status: 'active',
        expiresAt: { $gt: new Date() },
        $or: [
          { teamLeadId },
          { userId: teamLeadId },
        ],
      })
      .sort({ createdAt: -1 });
  }

  async getSessionHistory(userId?: string, limit = 50): Promise<StaffSession[]> {
    const query: any = {};
    if (userId) query.userId = userId;
    
    return this.sessionModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getSessionAnalytics(): Promise<{
    totalActive: number;
    byRole: Record<string, number>;
    recentTerminations: number;
  }> {
    const activeSessions = await this.sessionModel.find({ 
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    const byRole: Record<string, number> = {};
    for (const s of activeSessions) {
      byRole[s.role] = (byRole[s.role] || 0) + 1;
    }

    const recentTerminations = await this.sessionModel.countDocuments({
      status: 'terminated',
      terminatedAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    return {
      totalActive: activeSessions.length,
      byRole,
      recentTerminations,
    };
  }

  private parseDeviceName(userAgent: string): string {
    if (userAgent.includes('iPhone')) return 'iPhone Safari';
    if (userAgent.includes('Android')) return 'Android Browser';
    if (userAgent.includes('Mac')) {
      if (userAgent.includes('Chrome')) return 'MacBook Chrome';
      if (userAgent.includes('Safari')) return 'MacBook Safari';
      if (userAgent.includes('Firefox')) return 'MacBook Firefox';
    }
    if (userAgent.includes('Windows')) {
      if (userAgent.includes('Chrome')) return 'Windows Chrome';
      if (userAgent.includes('Edge')) return 'Windows Edge';
      if (userAgent.includes('Firefox')) return 'Windows Firefox';
    }
    return 'Unknown Device';
  }
}
