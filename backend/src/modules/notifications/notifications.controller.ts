import { Controller, Get, Patch, Param, Query, Req, Post, Body, UseGuards } from '@nestjs/common';
import { NotificationService, CreateNotificationInput } from './notification.service';
import { TelegramNotificationService } from './telegram-notification.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly telegramService: TelegramNotificationService,
  ) {}

  /**
   * Get my notifications
   */
  @Get('me')
  async myNotifications(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    
    if (!userId) {
      return { notifications: [], total: 0, unreadCount: 0 };
    }

    return this.notificationService.getMyNotifications(userId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      unreadOnly: unreadOnly === 'true',
    });
  }

  /**
   * Get unread count
   */
  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    
    if (!userId) {
      return { count: 0 };
    }

    const result = await this.notificationService.getMyNotifications(userId, { unreadOnly: true });
    return { count: result.unreadCount };
  }

  /**
   * Mark notification as read
   */
  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const notification = await this.notificationService.markAsRead(id, userId);
    return { success: !!notification, notification };
  }

  /**
   * Mark all notifications as read
   */
  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const count = await this.notificationService.markAllAsRead(userId);
    return { success: true, count };
  }

  /**
   * Get notification rules (admin only)
   */
  @Get('rules')
  async getRules() {
    return this.notificationService.getRules();
  }

  /**
   * Update notification rule (admin only)
   */
  @Patch('rules/:eventType')
  async updateRule(
    @Param('eventType') eventType: string,
    @Body() updates: any,
  ) {
    return this.notificationService.updateRule(eventType, updates);
  }

  /**
   * Test Telegram connection
   */
  @Get('telegram/test')
  async testTelegram() {
    return this.telegramService.testConnection();
  }

  /**
   * Send test notification via Telegram
   */
  @Post('telegram/send-test')
  async sendTestTelegram(@Body() body: { chatId: string; message?: string }) {
    const testMessage = body.message || '🔔 Тестове повідомлення з BIBI Cars CRM';
    
    try {
      await this.telegramService.send({
        chatId: body.chatId,
        text: testMessage,
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create test notification (for testing)
   */
  @Post('test')
  async createTestNotification(@Body() input: Partial<CreateNotificationInput>, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub || 'test-user';
    
    const notification = await this.notificationService.createNotification({
      type: input.type || 'test.notification',
      title: input.title || '🧪 Test Notification',
      message: input.message || 'This is a test notification',
      severity: input.severity || 'info',
      recipientUserIds: [userId],
      recipientRoles: input.recipientRoles || [],
      channels: {
        inApp: true,
        telegram: false,
        sound: input.channels?.sound ?? true,
        email: false,
      },
      soundKey: input.soundKey || 'alert',
      meta: input.meta || {},
    });

    // Deliver immediately
    await this.notificationService.deliver(notification);

    return notification;
  }
}
