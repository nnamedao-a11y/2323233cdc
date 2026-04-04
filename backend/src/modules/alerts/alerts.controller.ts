/**
 * Alerts Controller
 * 
 * Routes:
 * GET  /api/alerts/settings           - Get user alert settings
 * PATCH /api/alerts/settings          - Update alert settings
 * POST /api/alerts/link-telegram      - Link Telegram account
 * POST /api/alerts/test               - Send test alert
 * GET  /api/admin/alerts/stats        - Alert analytics
 * GET  /api/admin/alerts/logs         - Alert logs
 */

import { Controller, Get, Post, Patch, Body, Query, Req } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertEventType } from './alert-event.schema';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';

@Controller()
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly telegramService: TelegramBotService,
  ) {}

  // === USER SETTINGS ===
  
  @Get('alerts/settings')
  async getSettings(@Req() req: any, @Query('userId') userId?: string) {
    const id = userId || req.user?.id;
    if (!id) return null;
    return this.alertsService.getSettings(id);
  }

  @Patch('alerts/settings')
  async updateSettings(
    @Req() req: any,
    @Body() body: {
      telegramEnabled?: boolean;
      emailEnabled?: boolean;
      receiveCritical?: boolean;
      receiveHigh?: boolean;
      receiveMedium?: boolean;
      receiveLow?: boolean;
      enabledEvents?: string[];
      disabledEvents?: string[];
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
    }
  ) {
    const userId = req.user?.id;
    if (!userId) return { error: 'Unauthorized' };
    return this.alertsService.updateSettings(userId, body);
  }

  // === TELEGRAM LINKING ===
  
  @Post('alerts/link-telegram')
  async linkTelegram(
    @Req() req: any,
    @Body() body: { telegramChatId: string; userId?: string }
  ) {
    const userId = body.userId || req.user?.id;
    if (!userId) return { error: 'User ID required' };
    
    return this.alertsService.linkTelegram(userId, body.telegramChatId);
  }

  // === TEST ALERT ===
  
  @Post('alerts/test')
  async sendTestAlert(
    @Req() req: any,
    @Body() body: { telegramChatId?: string }
  ) {
    const chatId = body.telegramChatId;
    if (!chatId) return { error: 'Telegram chat ID required' };

    const testMessage = `✅ <b>Тестове повідомлення</b>\n\nВаш Telegram успішно підключено до BIBI Cars CRM!\n\nВи будете отримувати сповіщення про:\n• Входи менеджерів\n• Нові гарячі ліди\n• Оплати\n• Контракти\n• Доставку`;

    await this.telegramService.sendMessage({
      chatId,
      text: testMessage,
      parseMode: 'HTML',
    });

    return { success: true, message: 'Test alert sent' };
  }

  // === ADMIN: STATS ===
  
  @Get('admin/alerts/stats')
  async getStats(@Query('period') period?: string) {
    const periodDays = parseInt(period || '7', 10);
    return this.alertsService.getAlertStats(periodDays);
  }

  // === CRITICAL ALERTS (for Team Lead Dashboard) ===
  
  @Get('alerts/critical')
  async getCriticalAlerts(@Query('limit') limit?: string) {
    const limitNum = parseInt(limit || '20', 10);
    return this.alertsService.getCriticalAlerts(limitNum);
  }

  // === ADMIN: LOGS ===
  
  @Get('admin/alerts/logs')
  async getLogs(@Query('limit') limit?: string) {
    const limitNum = parseInt(limit || '50', 10);
    return this.alertsService.getAlertLogs(limitNum);
  }

  // === MANUAL ALERT TRIGGERS (FOR TESTING/ADMIN) ===
  
  @Post('admin/alerts/trigger')
  async triggerAlert(@Body() body: {
    eventType: AlertEventType;
    metadata?: Record<string, any>;
  }) {
    await this.alertsService.sendAlert({
      eventType: body.eventType,
      metadata: body.metadata || {},
    });
    return { success: true };
  }
}
