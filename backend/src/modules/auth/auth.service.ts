import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ActivityService } from '../activity/services/activity.service';
import { StaffSessionService } from '../staff-sessions/staff-session.service';
import { LoginDto, TokenResponseDto } from './dto/auth.dto';
import { CreateUserDto } from '../users/dto/user.dto';
import { AuditAction, EntityType, UserRole } from '../../shared/enums';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../activity/enums/activity-action.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditLogService: AuditLogService,
    private activityService: ActivityService,
    private staffSessionService: StaffSessionService,
  ) {}

  async login(loginDto: LoginDto, ip: string, userAgent?: string): Promise<TokenResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const isValid = await this.usersService.validatePassword(user, loginDto.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // === MANAGER DAILY SESSION LOGIC ===
    if (user.role === UserRole.MANAGER) {
      // Kill all old sessions for manager (daily reset)
      await this.staffSessionService.terminateAllUserSessions(user.id);
      this.logger.log(`Manager ${user.email}: old sessions terminated, creating new daily session`);
    }

    // Create new session with proper tracking
    const sessionData = await this.staffSessionService.createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      ip,
      userAgent: userAgent || 'Unknown',
      deviceId: this.generateDeviceId(ip, userAgent),
    });

    // === SEND LOGIN ALERTS ===
    // For MANAGER: alert TEAM_LEAD + OWNER
    if (user.role === UserRole.MANAGER) {
      this.sendLoginAlerts(user, ip, userAgent);
    }

    try {
      await this.usersService.updateLastLogin(user.id, ip);
    } catch (e) {
      this.logger.warn(`updateLastLogin failed: ${e.message}`);
    }
    
    try {
      await this.auditLogService.log({
        action: AuditAction.LOGIN,
        entityType: EntityType.USER,
        entityId: user.id,
        userId: user.id,
        details: { ip, userAgent, sessionId: sessionData?.session?.id },
      });
    } catch (e) {
      this.logger.warn(`auditLogService.log failed: ${e.message}`);
    }

    // Activity log - non-blocking
    try {
      this.activityService.logAsync({
        userId: user.id,
        userRole: user.role,
        userName: `${user.firstName} ${user.lastName}`,
        action: ActivityAction.LOGIN,
        entityType: ActivityEntityType.USER,
        entityId: user.id,
        context: { ip, source: ActivitySource.WEB },
      });
    } catch (e) {
      this.logger.warn(`activityService.logAsync failed: ${e.message}`);
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  // Send login alerts to TEAM_LEAD and OWNER
  private async sendLoginAlerts(user: any, ip: string, userAgent?: string): Promise<void> {
    try {
      const alertData = {
        type: 'manager_login',
        manager: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
        },
        ip,
        device: userAgent || 'Unknown',
        time: new Date().toISOString(),
      };

      // Log alert (in production: send to Telegram/Email)
      this.logger.log(`LOGIN ALERT: Manager ${user.email} logged in from ${ip}`);
      
      // Store alert for OWNER/TEAM_LEAD dashboard
      await this.staffSessionService.createLoginAlert(alertData);
    } catch (err) {
      this.logger.warn(`Failed to send login alert: ${err.message}`);
    }
  }

  private generateDeviceId(ip: string, userAgent?: string): string {
    const hash = require('crypto').createHash('md5');
    hash.update(`${ip}-${userAgent || ''}`);
    return hash.digest('hex').substring(0, 16);
  }

  async register(createUserDto: CreateUserDto): Promise<TokenResponseDto> {
    const existing = await this.usersService.findByEmail(createUserDto.email);
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const user = await this.usersService.create({
      ...createUserDto,
      role: UserRole.MANAGER,
    });

    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: EntityType.USER,
      entityId: user.id,
      userId: user.id,
      details: { email: user.email },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.usersService.findByEmail(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return this.usersService.changePassword(userId, newPassword);
  }

  async validateUser(userId: string): Promise<any> {
    return this.usersService.findById(userId);
  }
}
