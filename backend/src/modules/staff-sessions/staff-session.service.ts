import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StaffSession, SessionStatus, TwoFactorMethod } from './staff-session.schema';
import { User } from '../users/user.schema';
import { generateId } from '../../shared/utils';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

export interface CreateSessionDto {
  userId: string;
  role: string;
  email?: string;
  deviceId?: string;
  ip?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionAlert {
  type: 'NEW_DEVICE' | 'UNUSUAL_IP' | 'FAILED_2FA' | 'CONCURRENT_SESSION' | 'SUSPICIOUS';
  userId: string;
  sessionId: string;
  message: string;
  messageUk: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  data?: any;
}

@Injectable()
export class StaffSessionService {
  private readonly logger = new Logger(StaffSessionService.name);
  private readonly SESSION_TIMEOUT_HOURS = 24;
  private readonly IDLE_TIMEOUT_MINUTES = 30;
  
  constructor(
    @InjectModel(StaffSession.name) private sessionModel: Model<StaffSession>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // Helper: get end of day for manager session expiry
  private getEndOfDay(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }

  // === CREATE SESSION ===
  
  async createSession(dto: CreateSessionDto): Promise<{ session: StaffSession; alerts: SessionAlert[] }> {
    const alerts: SessionAlert[] = [];
    const ipAddress = dto.ip || dto.ipAddress;
    const email = dto.email || dto.userId;

    // Check for existing active sessions
    const existingSessions = await this.sessionModel.find({
      userId: dto.userId,
      status: SessionStatus.ACTIVE,
    });

    // Check if new device
    const isNewDevice = dto.deviceId 
      ? !(await this.sessionModel.findOne({ userId: dto.userId, deviceId: dto.deviceId }))
      : false;

    // Check for unusual location (simplified - compare to recent IPs)
    const recentIPs = await this.sessionModel.distinct('ipAddress', {
      userId: dto.userId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    const isUnusualLocation = ipAddress && recentIPs.length > 0 && !recentIPs.includes(ipAddress);

    // Detect suspicious activity
    const isSuspicious = (existingSessions.length > 2) || (isNewDevice && isUnusualLocation);

    // Create alerts
    if (isNewDevice) {
      alerts.push({
        type: 'NEW_DEVICE',
        userId: dto.userId,
        sessionId: '',
        message: `Login from new device for ${email}`,
        messageUk: `Вхід з нового пристрою для ${email}`,
        severity: 'MEDIUM',
        data: { deviceId: dto.deviceId, ip: ipAddress },
      });
    }

    if (isUnusualLocation) {
      alerts.push({
        type: 'UNUSUAL_IP',
        userId: dto.userId,
        sessionId: '',
        message: `Login from unusual IP for ${email}`,
        messageUk: `Вхід з незвичної IP для ${email}`,
        severity: 'MEDIUM',
        data: { ip: ipAddress, recentIPs },
      });
    }

    if (existingSessions.length > 2) {
      alerts.push({
        type: 'CONCURRENT_SESSION',
        userId: dto.userId,
        sessionId: '',
        message: `${existingSessions.length + 1} concurrent sessions for ${email}`,
        messageUk: `${existingSessions.length + 1} одночасних сесій для ${email}`,
        severity: 'HIGH',
      });
    }

    // Determine if owner approval required (for OWNER role on new device)
    const requiresOwnerApproval = dto.role === 'owner' && isNewDevice;

    // Set session expiration to end of day for managers
    const expiresAt = dto.role === 'manager' ? this.getEndOfDay() : new Date(Date.now() + this.SESSION_TIMEOUT_HOURS * 60 * 60 * 1000);

    const session = new this.sessionModel({
      id: generateId(),
      userId: dto.userId,
      role: dto.role,
      email,
      deviceId: dto.deviceId,
      ipAddress,
      userAgent: dto.userAgent,
      startedAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt,
      status: SessionStatus.ACTIVE,
      isNewDevice,
      isUnusualLocation,
      isSuspicious,
      suspiciousReason: isSuspicious ? 'Multiple concurrent sessions or new device + unusual location' : undefined,
      requiresOwnerApproval,
    });

    await session.save();
    
    // Update alert session IDs
    alerts.forEach(a => a.sessionId = session.id);

    this.logger.log(`Session created for ${dto.email} (${session.id})`);
    
    return { session, alerts };
  }

  // === 2FA SETUP ===
  
  async setup2FA(userId: string): Promise<{ secret: string; qrCode: string; otpauthUrl: string }> {
    const user = await this.userModel.findOne({ id: userId });
    if (!user) throw new Error('User not found');

    const secret = speakeasy.generateSecret({
      name: `BIBI CRM (${user.email})`,
      length: 20,
    });

    // Save secret to user (encrypted in production)
    await this.userModel.updateOne(
      { id: userId },
      { $set: { twoFactorSecret: secret.base32 } }
    );

    const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

    return {
      secret: secret.base32,
      qrCode,
      otpauthUrl: secret.otpauth_url || '',
    };
  }

  // === VERIFY 2FA ===
  
  async verify2FA(userId: string, token: string, sessionId: string): Promise<boolean> {
    const user = await this.userModel.findOne({ id: userId });
    if (!user || !user.twoFactorSecret) {
      return false;
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1, // Allow 1 step tolerance
    });

    if (verified) {
      await this.sessionModel.updateOne(
        { id: sessionId },
        { 
          $set: { 
            twoFactorVerified: true,
            twoFactorMethod: TwoFactorMethod.TOTP,
          } 
        }
      );
      
      // Enable 2FA on user if first time
      if (!user.twoFactorEnabled) {
        await this.userModel.updateOne(
          { id: userId },
          { $set: { twoFactorEnabled: true } }
        );
      }
    }

    return verified;
  }

  // === UPDATE SESSION ACTIVITY ===
  
  async updateActivity(sessionId: string): Promise<void> {
    await this.sessionModel.updateOne(
      { id: sessionId },
      { 
        $set: { lastSeenAt: new Date() },
        $inc: { actionsCount: 1 },
      }
    );
  }

  // === END SESSION ===
  
  async endSession(sessionId: string, reason: string = 'user_logout'): Promise<void> {
    await this.sessionModel.updateOne(
      { id: sessionId },
      { 
        $set: { 
          status: SessionStatus.ENDED,
          endedAt: new Date(),
          endReason: reason,
        } 
      }
    );
  }

  // === FORCE LOGOUT ===
  
  async forceLogout(sessionId: string, byUserId: string, reason: string): Promise<void> {
    await this.sessionModel.updateOne(
      { id: sessionId },
      { 
        $set: { 
          status: SessionStatus.FORCED_LOGOUT,
          endedAt: new Date(),
          endReason: `Forced by ${byUserId}: ${reason}`,
        } 
      }
    );
    this.logger.warn(`Session ${sessionId} force logged out by ${byUserId}`);
  }

  // === FORCE LOGOUT ALL USER SESSIONS ===
  
  async forceLogoutUser(userId: string, byUserId: string, reason: string): Promise<number> {
    const result = await this.sessionModel.updateMany(
      { userId, status: SessionStatus.ACTIVE },
      { 
        $set: { 
          status: SessionStatus.FORCED_LOGOUT,
          endedAt: new Date(),
          endReason: `All sessions forced by ${byUserId}: ${reason}`,
        } 
      }
    );
    return result.modifiedCount;
  }

  // === TERMINATE ALL USER SESSIONS (FOR DAILY RESET) ===
  
  async terminateAllUserSessions(userId: string): Promise<number> {
    const result = await this.sessionModel.updateMany(
      { userId, status: SessionStatus.ACTIVE },
      { 
        $set: { 
          status: SessionStatus.ENDED,
          endedAt: new Date(),
          endReason: 'daily_reset',
        } 
      }
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Terminated ${result.modifiedCount} sessions for user ${userId} (daily reset)`);
    }
    return result.modifiedCount;
  }

  // === CREATE LOGIN ALERT ===
  
  async createLoginAlert(alertData: any): Promise<void> {
    // Store alert in session alerts collection (or log for now)
    // In production: send to Telegram/Email
    this.logger.log(`LOGIN ALERT: ${JSON.stringify(alertData)}`);
    
    // Store as suspicious if needed
    if (alertData.type === 'manager_login') {
      // Could store in a separate alerts collection
      // For now, we track via session model with suspicious flag
    }
  }

  // === GET ACTIVE SESSIONS ===
  
  async getActiveSessions(): Promise<StaffSession[]> {
    return this.sessionModel.find({
      status: SessionStatus.ACTIVE,
    }).sort({ lastSeenAt: -1 });
  }

  // === GET USER SESSIONS ===
  
  async getUserSessions(userId: string, limit: number = 20): Promise<StaffSession[]> {
    return this.sessionModel.find({ userId })
      .sort({ startedAt: -1 })
      .limit(limit);
  }

  // === GET SUSPICIOUS SESSIONS ===
  
  async getSuspiciousSessions(): Promise<StaffSession[]> {
    return this.sessionModel.find({
      $or: [
        { isSuspicious: true },
        { isNewDevice: true },
        { isUnusualLocation: true },
      ],
      status: SessionStatus.ACTIVE,
    }).sort({ startedAt: -1 });
  }

  // === SESSION ANALYTICS ===
  
  async getSessionAnalytics(periodDays: number = 30): Promise<any> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const [
      totalSessions,
      activeSessions,
      suspiciousSessions,
      forcedLogouts,
      byRole,
      avgDuration,
    ] = await Promise.all([
      this.sessionModel.countDocuments({ createdAt: { $gte: periodStart } }),
      this.sessionModel.countDocuments({ status: SessionStatus.ACTIVE }),
      this.sessionModel.countDocuments({ isSuspicious: true, createdAt: { $gte: periodStart } }),
      this.sessionModel.countDocuments({ status: SessionStatus.FORCED_LOGOUT, createdAt: { $gte: periodStart } }),
      this.sessionModel.aggregate([
        { $match: { createdAt: { $gte: periodStart } } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      this.sessionModel.aggregate([
        { 
          $match: { 
            createdAt: { $gte: periodStart },
            endedAt: { $exists: true },
          } 
        },
        { 
          $project: { 
            duration: { $subtract: ['$endedAt', '$startedAt'] } 
          } 
        },
        { $group: { _id: null, avg: { $avg: '$duration' } } },
      ]),
    ]);

    return {
      totalSessions,
      activeSessions,
      suspiciousSessions,
      forcedLogouts,
      byRole: byRole.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      avgDurationMinutes: avgDuration[0] ? Math.round(avgDuration[0].avg / 60000) : 0,
      periodDays,
    };
  }

  // === CLEANUP EXPIRED SESSIONS ===
  
  async cleanupExpiredSessions(): Promise<number> {
    const expireTime = new Date(Date.now() - this.SESSION_TIMEOUT_HOURS * 60 * 60 * 1000);
    
    const result = await this.sessionModel.updateMany(
      {
        status: SessionStatus.ACTIVE,
        lastSeenAt: { $lt: expireTime },
      },
      {
        $set: {
          status: SessionStatus.EXPIRED,
          endedAt: new Date(),
          endReason: 'Session timeout',
        },
      }
    );

    return result.modifiedCount;
  }

  // === GET LOGIN ALERTS (for Team Lead Panel) ===
  
  async getLoginAlerts(limit: number = 10): Promise<any[]> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const sessions = await this.sessionModel.find({
      startedAt: { $gte: oneDayAgo },
    })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();

    // Get user details
    const userIds = [...new Set(sessions.map(s => s.userId))];
    const users = await this.userModel.find({ id: { $in: userIds } }).lean();
    const userMap = new Map(users.map(u => [u.id, u]));

    return sessions.map(session => {
      const user = userMap.get(session.userId);
      return {
        id: session.id,
        userId: session.userId,
        ip: session.ipAddress,
        time: session.startedAt,
        userAgent: session.userAgent,
        isNewDevice: session.isNewDevice,
        isUnusualLocation: session.isUnusualLocation,
        isSuspicious: session.isSuspicious,
        manager: user ? {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
        } : null,
      };
    });
  }
}
