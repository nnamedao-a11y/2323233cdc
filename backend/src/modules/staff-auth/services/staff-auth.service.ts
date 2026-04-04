import { User } from '../../users/user.schema';
import { 
  Injectable, 
  Logger, 
  UnauthorizedException, 
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

import { LoginRequest, LoginRequestDocument } from '../schemas/login-request.schema';
import { SmsVerificationService } from './sms-verification.service';
import { LoginApprovalService } from './login-approval.service';
import { StaffSessionService } from './staff-session.service';
import { SecuritySettingsService } from './security-settings.service';
import { StaffLoginDto, VerifySmsDto } from '../dto/staff-auth.dto';

export interface LoginStartResult {
  requestToken: string;
  smsRequired: boolean;
  approvalRequired: boolean;
  debugSmsCode?: string;
}

export interface VerifySmsResult {
  approved: boolean;
  sessionToken?: string;
  pendingOwnerApproval?: boolean;
  message?: string;
}

@Injectable()
export class StaffAuthService {
  private readonly logger = new Logger(StaffAuthService.name);

  constructor(
    @InjectModel(LoginRequest.name)
    private readonly loginRequestModel: Model<LoginRequestDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<any>,
    private readonly smsService: SmsVerificationService,
    private readonly approvalService: LoginApprovalService,
    private readonly sessionService: StaffSessionService,
    private readonly settingsService: SecuritySettingsService,
  ) {}

  async loginStart(dto: StaffLoginDto, req: any): Promise<LoginStartResult> {
    const settings = await this.settingsService.getSettings();

    const user = await this.userModel.findOne({ 
      email: dto.email.toLowerCase(),
      isActive: true,
      isDeleted: { $ne: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const staffRoles = ['owner', 'team_lead', 'manager', 'master_admin'];
    if (!staffRoles.includes(user.role)) {
      throw new ForbiddenException('Access denied for this role');
    }

    const token = randomUUID();
    const smsCode = this.smsService.generateCode();

    await this.loginRequestModel.create({
      userId: user.id,
      role: user.role,
      email: user.email,
      ip: req.ip || req.connection?.remoteAddress || 'unknown',
      userAgent: req.headers?.['user-agent'] || 'unknown',
      deviceId: dto.deviceId,
      status: 'pending',
      smsCode: settings.smsRequired ? smsCode : null,
      smsExpiresAt: settings.smsRequired 
        ? new Date(Date.now() + settings.smsCodeExpiryMinutes * 60 * 1000)
        : null,
      token,
      expiresAt: new Date(Date.now() + settings.loginRequestExpiryMinutes * 60 * 1000),
    });

    let debugSmsCode: string | undefined;
    if (settings.smsRequired && user.phone) {
      const smsResult = await this.smsService.sendSms(user.phone, smsCode);
      debugSmsCode = smsResult.debugCode;
    }

    const isOwner = user.role === 'owner' || user.role === 'master_admin';
    const approvalRequired = !isOwner && settings.requireOwnerApproval;

    this.logger.log(`Login started for ${user.email} (${user.role})`);

    return {
      requestToken: token,
      smsRequired: settings.smsRequired,
      approvalRequired,
      debugSmsCode,
    };
  }

  async verifySms(dto: VerifySmsDto, req: any): Promise<VerifySmsResult> {
    const settings = await this.settingsService.getSettings();

    const loginRequest = await this.loginRequestModel.findOne({
      token: dto.requestToken,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });

    if (!loginRequest) {
      throw new UnauthorizedException('Login request not found or expired');
    }

    if (settings.smsRequired) {
      if (!loginRequest.smsCode || !loginRequest.smsExpiresAt) {
        throw new BadRequestException('SMS verification not available');
      }

      if (new Date() > loginRequest.smsExpiresAt) {
        throw new UnauthorizedException('SMS code expired');
      }

      if (!this.smsService.verifyCode(dto.code, loginRequest.smsCode)) {
        throw new UnauthorizedException('Invalid SMS code');
      }
    }

    loginRequest.smsVerifiedAt = new Date();
    loginRequest.status = 'sms_verified';
    await loginRequest.save();

    const user = await this.userModel.findOne({ id: loginRequest.userId });
    const isOwner = loginRequest.role === 'owner' || loginRequest.role === 'master_admin';

    if (isOwner) {
      const session = await this.sessionService.createSession({
        userId: loginRequest.userId,
        email: loginRequest.email,
        role: loginRequest.role,
        ip: loginRequest.ip,
        userAgent: loginRequest.userAgent,
        deviceId: loginRequest.deviceId,
      });

      loginRequest.status = 'approved';
      loginRequest.approvedAt = new Date();
      await loginRequest.save();

      this.logger.log(`OWNER ${loginRequest.email} logged in directly`);

      return {
        approved: true,
        sessionToken: session.sessionToken,
      };
    }

    if (settings.requireOwnerApproval) {
      const urls = this.approvalService.buildApprovalUrls(loginRequest.token);

      await this.approvalService.sendApprovalEmail({
        to: settings.approvalEmail,
        userEmail: loginRequest.email,
        userName: user?.firstName ? `${user.firstName} ${user.lastName}` : loginRequest.email,
        role: loginRequest.role,
        ip: loginRequest.ip,
        userAgent: loginRequest.userAgent,
        approveUrl: urls.approveUrl,
        denyUrl: urls.denyUrl,
        requestToken: loginRequest.token,
      });

      this.logger.log(`Approval email sent to ${settings.approvalEmail} for ${loginRequest.email}`);

      return {
        approved: false,
        pendingOwnerApproval: true,
        message: 'Waiting for owner approval.',
      };
    }

    const session = await this.sessionService.createSession({
      userId: loginRequest.userId,
      email: loginRequest.email,
      role: loginRequest.role,
      teamLeadId: user?.teamLeadId,
      ip: loginRequest.ip,
      userAgent: loginRequest.userAgent,
      deviceId: loginRequest.deviceId,
    });

    loginRequest.status = 'approved';
    loginRequest.approvedAt = new Date();
    await loginRequest.save();

    return {
      approved: true,
      sessionToken: session.sessionToken,
    };
  }

  async approveLogin(token: string, ownerUserId: string): Promise<{ success: boolean; message: string }> {
    const loginRequest = await this.loginRequestModel.findOne({
      token,
      status: 'sms_verified',
      expiresAt: { $gt: new Date() },
    });

    if (!loginRequest) {
      throw new NotFoundException('Login request not found or expired');
    }

    const user = await this.userModel.findOne({ id: loginRequest.userId });

    const session = await this.sessionService.createSession({
      userId: loginRequest.userId,
      email: loginRequest.email,
      role: loginRequest.role,
      teamLeadId: user?.teamLeadId,
      ip: loginRequest.ip,
      userAgent: loginRequest.userAgent,
      deviceId: loginRequest.deviceId,
      approvedByUserId: ownerUserId,
    });

    loginRequest.status = 'approved';
    loginRequest.approvedAt = new Date();
    loginRequest.approvedByUserId = ownerUserId;
    await loginRequest.save();

    this.logger.log(`Login APPROVED for ${loginRequest.email} by owner`);

    return {
      success: true,
      message: `Login approved for ${loginRequest.email}`,
    };
  }

  async denyLogin(token: string, ownerUserId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const loginRequest = await this.loginRequestModel.findOne({
      token,
      status: 'sms_verified',
    });

    if (!loginRequest) {
      throw new NotFoundException('Login request not found');
    }

    loginRequest.status = 'denied';
    loginRequest.deniedAt = new Date();
    loginRequest.approvedByUserId = ownerUserId;
    loginRequest.denyReason = reason || 'Denied by owner';
    await loginRequest.save();

    this.logger.log(`Login DENIED for ${loginRequest.email} - ${reason || 'no reason'}`);

    return {
      success: true,
      message: `Login denied for ${loginRequest.email}`,
    };
  }

  async getPendingRequests(): Promise<LoginRequest[]> {
    return this.loginRequestModel
      .find({ 
        status: 'sms_verified',
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });
  }

  async getLoginRequestStatus(token: string): Promise<{
    status: string;
    sessionToken?: string;
  }> {
    const request = await this.loginRequestModel.findOne({ token });
    
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return { status: request.status };
  }
}
