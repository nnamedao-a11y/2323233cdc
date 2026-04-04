import { 
  Controller, 
  Get, 
  Post, 
  Patch,
  Delete,
  Body, 
  Param, 
  Query,
  Req,
  UseGuards 
} from '@nestjs/common';
import { SmartNotificationService } from './smart-notification.service';
import { TelegramService } from './telegram.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';

/**
 * Notification Controller
 * 
 * Endpoints for managing notifications and Telegram links
 * 
 * Admin/Manager endpoints:
 * - GET /notifications - List notifications
 * - POST /notifications/telegram/webhook - Telegram webhook handler
 * 
 * Customer endpoints:
 * - GET /notifications/customer/me - Get customer notifications
 * - PATCH /notifications/customer/:id/read - Mark as read
 */

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: SmartNotificationService,
    private readonly telegramService: TelegramService,
  ) {}

  // ============ ADMIN/MANAGER ENDPOINTS ============

  @Get()
  @UseGuards(JwtAuthGuard)
  async getNotifications(
    @Req() req: any,
    @Query('unread') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.getNotifications({
      managerId: req.user.id,
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationService.getUnreadCount({
      managerId: req.user.id,
    });
    return { count };
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  async markAsRead(@Param('id') id: string) {
    const success = await this.notificationService.markAsRead(id);
    return { success };
  }

  @Post('mark-all-read')
  @UseGuards(JwtAuthGuard)
  async markAllAsRead(@Req() req: any) {
    const count = await this.notificationService.markAllAsRead({
      managerId: req.user.id,
    });
    return { markedCount: count };
  }

  // ============ CUSTOMER ENDPOINTS ============

  @Get('customer/me')
  @UseGuards(CustomerJwtGuard)
  async getCustomerNotifications(
    @Req() req: any,
    @Query('unread') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.getNotifications({
      customerId: req.user.customerId,
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('customer/unread-count')
  @UseGuards(CustomerJwtGuard)
  async getCustomerUnreadCount(@Req() req: any) {
    const count = await this.notificationService.getUnreadCount({
      customerId: req.user.customerId,
    });
    return { count };
  }

  @Patch('customer/:id/read')
  @UseGuards(CustomerJwtGuard)
  async customerMarkAsRead(@Param('id') id: string) {
    const success = await this.notificationService.markAsRead(id);
    return { success };
  }

  // ============ TELEGRAM ENDPOINTS ============

  @Post('telegram/webhook/:secret')
  async telegramWebhook(
    @Param('secret') secret: string,
    @Body() body: any,
  ) {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'webhook-secret';
    if (secret !== expectedSecret) {
      return { ok: false };
    }

    const message = body.message;
    if (!message) {
      return { ok: true };
    }

    const chatId = message.chat?.id?.toString();
    const text = message.text || '';
    const user = message.from;

    // Handle /start command - link account
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const linkCode = parts[1]; // Optional link code

      await this.telegramService.linkAccount({
        telegramChatId: chatId,
        telegramUsername: user?.username,
        telegramFirstName: user?.first_name,
        telegramLastName: user?.last_name,
        // TODO: Parse linkCode to get userId/customerId
      });

      await this.telegramService.sendMessage(
        chatId,
        '👋 <b>Вітаємо в BIBI Cars!</b>\n\n' +
        'Тепер ви будете отримувати сповіщення:\n' +
        '• ⏰ Аукціони скоро\n' +
        '• 📉 Зниження цін\n' +
        '• 📋 Статуси замовлень\n\n' +
        'Використовуйте /settings щоб налаштувати сповіщення.',
      );

      return { ok: true };
    }

    // Handle /settings command
    if (text === '/settings') {
      const link = await this.telegramService.getLinkByChatId(chatId);
      if (!link) {
        await this.telegramService.sendMessage(chatId, 'Акаунт не прив\'язано. Використайте /start');
        return { ok: true };
      }

      const prefs = link.preferences || {};
      await this.telegramService.sendMessage(
        chatId,
        '<b>⚙️ Налаштування сповіщень</b>\n\n' +
        `• Аукціони: ${prefs.auctionAlerts !== false ? '✅' : '❌'}\n` +
        `• Ціни: ${prefs.priceAlerts !== false ? '✅' : '❌'}\n` +
        `• Угоди: ${prefs.dealAlerts !== false ? '✅' : '❌'}\n` +
        `• Рекомендації: ${prefs.recommendations !== false ? '✅' : '❌'}\n\n` +
        'Для зміни - зверніться до підтримки.',
      );

      return { ok: true };
    }

    // Handle /stop command
    if (text === '/stop') {
      await this.telegramService.unlinkAccount(chatId);
      await this.telegramService.sendMessage(
        chatId,
        'Сповіщення вимкнено. Використайте /start щоб увімкнути знову.',
      );
      return { ok: true };
    }

    return { ok: true };
  }

  @Get('telegram/status')
  @UseGuards(JwtAuthGuard)
  async getTelegramStatus(@Req() req: any) {
    const link = await this.telegramService.getLinkByUserId(req.user.id);
    return {
      isLinked: !!link,
      isConfigured: this.telegramService.isConfigured(),
      link: link ? {
        username: link.telegramUsername,
        firstName: link.telegramFirstName,
        notificationsEnabled: link.notificationsEnabled,
        linkedAt: link.linkedAt,
      } : null,
    };
  }

  @Get('telegram/link-code')
  @UseGuards(JwtAuthGuard)
  async getTelegramLinkCode(@Req() req: any) {
    // Generate link code for this user
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'BIBICarsBot';
    const linkCode = Buffer.from(`user:${req.user.id}`).toString('base64');
    
    return {
      url: `https://t.me/${botUsername}?start=${linkCode}`,
      botUsername,
    };
  }
}
