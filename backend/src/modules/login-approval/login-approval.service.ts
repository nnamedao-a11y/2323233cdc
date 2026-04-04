/**
 * Login Approval Service
 * 
 * Handles Team Lead login approval flow:
 * 1. Team Lead attempts login
 * 2. System creates pending request
 * 3. Owner receives Telegram alert with approve/deny buttons
 * 4. Owner approves/denies
 * 5. If approved, session created
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LoginApprovalRequest, LoginApprovalStatus } from './login-request.schema';
import { AlertsService } from '../alerts/alerts.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { AlertEventType } from '../alerts/alert-event.schema';
import { generateId } from '../../shared/utils';

@Injectable()
export class LoginApprovalService {
  private readonly logger = new Logger(LoginApprovalService.name);

  constructor(
    @InjectModel(LoginApprovalRequest.name) private loginApprovalModel: Model<LoginApprovalRequest>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('AlertSettings') private alertSettingsModel: Model<any>,
    private alertsService: AlertsService,
    private telegramService: TelegramBotService,
  ) {}

  /**
   * Create login request for Team Lead
   */
  async createLoginRequest(
    userId: string,
    userName: string,
    userEmail: string,
    context: { ip?: string; userAgent?: string; device?: string }
  ): Promise<LoginApprovalRequest> {
    // Check for existing pending request
    const existing = await this.loginApprovalModel.findOne({
      userId,
      status: LoginApprovalStatus.PENDING,
      expiresAt: { $gt: new Date() },
    });

    if (existing) {
      return existing;
    }

    // Create new request
    const request = new this.loginApprovalModel({
      id: generateId(),
      userId,
      userName,
      userEmail,
      userRole: 'team_lead',
      status: LoginApprovalStatus.PENDING,
      ip: context.ip,
      userAgent: context.userAgent,
      device: context.device,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    });

    await request.save();

    // Send alert to Owner via Telegram
    await this.sendApprovalRequestToOwner(request);

    this.logger.log(`Login request created for Team Lead: ${userName} (${request.id})`);

    return request;
  }

  /**
   * Send approval request to Owner via Telegram
   */
  private async sendApprovalRequestToOwner(request: LoginApprovalRequest): Promise<void> {
    // Find owner(s)
    const owners = await this.userModel.find({ role: 'master_admin' }).lean() as any[];

    for (const owner of owners) {
      // Get owner's Telegram chat ID
      const settings = await this.alertSettingsModel.findOne({ userId: owner.id }).lean() as any;
      const chatId = settings?.telegramChatId || owner.telegramChatId;

      if (!chatId) continue;

      const message = `🔐 <b>Запит на вхід Team Lead</b>

<b>Користувач:</b> ${request.userName}
<b>Email:</b> ${request.userEmail}
<b>IP:</b> ${request.ip || 'Невідомо'}
<b>Пристрій:</b> ${request.device || request.userAgent?.slice(0, 50) || 'Невідомо'}
<b>Час:</b> ${new Date().toLocaleString('uk-UA')}

Запит дійсний 30 хвилин.`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '✅ Дозволити', callback_data: `approve_login:${request.id}` },
            { text: '❌ Відхилити', callback_data: `deny_login:${request.id}` },
          ],
        ],
      };

      try {
        const result = await this.telegramService.sendMessage({
          chatId,
          text: message,
          replyMarkup,
          parseMode: 'HTML',
        });

        if (result?.result?.message_id) {
          request.telegramMessageId = result.result.message_id;
          await request.save();
        }
      } catch (error) {
        this.logger.error(`Failed to send Telegram approval request: ${error.message}`);
      }
    }

    // Also send via alert system
    await this.alertsService.sendAlert({
      eventType: AlertEventType.TEAMLEAD_LOGIN_REQUEST,
      metadata: {
        userName: request.userName,
        email: request.userEmail,
        ip: request.ip,
        requestId: request.id,
      },
    });
  }

  /**
   * Approve login request
   */
  async approveRequest(requestId: string, approverId: string, approverName?: string): Promise<LoginApprovalRequest> {
    const request = await this.loginApprovalModel.findOne({ id: requestId });

    if (!request) {
      throw new UnauthorizedException('Login request not found');
    }

    if (request.status !== LoginApprovalStatus.PENDING) {
      throw new UnauthorizedException('Request already processed');
    }

    if (new Date() > request.expiresAt) {
      request.status = LoginApprovalStatus.EXPIRED;
      await request.save();
      throw new UnauthorizedException('Request expired');
    }

    request.status = LoginApprovalStatus.APPROVED;
    request.approvedBy = approverId;
    request.approverName = approverName || '';
    request.approvedAt = new Date();
    await request.save();

    // Update Telegram message
    await this.updateTelegramMessage(request, 'approved');

    // Send notification to Team Lead
    await this.alertsService.sendAlert({
      eventType: AlertEventType.TEAMLEAD_LOGIN_APPROVED,
      metadata: {
        userName: request.userName,
        approverName: approverName || 'Owner',
      },
    });

    this.logger.log(`Login request approved: ${request.userName} by ${approverName || approverId}`);

    return request;
  }

  /**
   * Deny login request
   */
  async denyRequest(requestId: string, denierId: string, reason?: string): Promise<LoginApprovalRequest> {
    const request = await this.loginApprovalModel.findOne({ id: requestId });

    if (!request) {
      throw new UnauthorizedException('Login request not found');
    }

    if (request.status !== LoginApprovalStatus.PENDING) {
      throw new UnauthorizedException('Request already processed');
    }

    request.status = LoginApprovalStatus.DENIED;
    request.deniedAt = new Date();
    request.denyReason = reason || 'Denied by admin';
    await request.save();

    // Update Telegram message
    await this.updateTelegramMessage(request, 'denied');

    this.logger.log(`Login request denied: ${request.userName}`);

    return request;
  }

  /**
   * Update Telegram message with result
   */
  private async updateTelegramMessage(request: LoginApprovalRequest, action: 'approved' | 'denied'): Promise<void> {
    if (!request.telegramMessageId) return;

    // Find owner's chat ID
    const owners = await this.userModel.find({ role: 'master_admin' }).lean() as any[];
    
    for (const owner of owners) {
      const settings = await this.alertSettingsModel.findOne({ userId: owner.id }).lean() as any;
      const chatId = settings?.telegramChatId || owner.telegramChatId;

      if (!chatId) continue;

      const statusText = action === 'approved' ? '✅ ДОЗВОЛЕНО' : '❌ ВІДХИЛЕНО';
      const message = `🔐 <b>Запит на вхід Team Lead</b>

<b>Користувач:</b> ${request.userName}
<b>Email:</b> ${request.userEmail}

<b>Статус:</b> ${statusText}
<b>Час:</b> ${new Date().toLocaleString('uk-UA')}`;

      try {
        await this.telegramService.editMessage(
          chatId,
          parseInt(request.telegramMessageId),
          message,
        );
      } catch (error) {
        this.logger.error(`Failed to update Telegram message: ${error.message}`);
      }
    }
  }

  /**
   * Check if login request is approved
   */
  async isRequestApproved(requestId: string): Promise<boolean> {
    const request = await this.loginApprovalModel.findOne({ id: requestId });
    return request?.status === LoginApprovalStatus.APPROVED;
  }

  /**
   * Get pending request for user
   */
  async getPendingRequest(userId: string): Promise<any | null> {
    const request = await this.loginApprovalModel.findOne({
      userId,
      status: LoginApprovalStatus.PENDING,
      expiresAt: { $gt: new Date() },
    }).lean();
    return request;
  }

  /**
   * Handle Telegram callback
   */
  async handleTelegramCallback(callbackData: string, callbackQueryId: string, userId: string): Promise<string> {
    const [action, requestId] = callbackData.split(':');

    // Verify user is owner
    const user = await this.userModel.findOne({ telegramChatId: String(userId) }).lean() as any;
    if (!user || user.role !== 'master_admin') {
      await this.telegramService.answerCallbackQuery(callbackQueryId, 'Недостатньо прав', true);
      return 'Unauthorized';
    }

    try {
      if (action === 'approve_login') {
        await this.approveRequest(requestId, user.id, `${user.firstName || ''} ${user.lastName || ''}`.trim());
        await this.telegramService.answerCallbackQuery(callbackQueryId, '✅ Вхід дозволено');
        return 'approved';
      } else if (action === 'deny_login') {
        await this.denyRequest(requestId, user.id);
        await this.telegramService.answerCallbackQuery(callbackQueryId, '❌ Вхід відхилено');
        return 'denied';
      }
    } catch (error) {
      await this.telegramService.answerCallbackQuery(callbackQueryId, error.message, true);
      return 'error';
    }

    return 'unknown';
  }

  /**
   * Get request status
   */
  async getRequestStatus(requestId: string): Promise<any> {
    const request = await this.loginApprovalModel.findOne({ id: requestId }).lean();
    if (!request) return null;

    return {
      id: request.id,
      status: request.status,
      userName: request.userName,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      approvedAt: request.approvedAt,
      deniedAt: request.deniedAt,
    };
  }

  /**
   * Get all pending requests (admin)
   */
  async getPendingRequests(): Promise<any[]> {
    return this.loginApprovalModel.find({
      status: LoginApprovalStatus.PENDING,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 }).lean();
  }

  /**
   * Cleanup expired requests
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.loginApprovalModel.updateMany(
      {
        status: LoginApprovalStatus.PENDING,
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: LoginApprovalStatus.EXPIRED } }
    );
    return result.modifiedCount;
  }
}
