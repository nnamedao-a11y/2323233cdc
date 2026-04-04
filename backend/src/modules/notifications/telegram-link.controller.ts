import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TelegramLink, TelegramLinkDocument } from './schemas/telegram-link.schema';
import { TelegramNotificationService } from './telegram-notification.service';
import { generateId } from '../../shared/utils';
import { UserRole } from '../../shared/enums';

const isOwner = (role: string) => role === UserRole.OWNER || role === 'master_admin';

@Controller('telegram-link')
@UseGuards(JwtAuthGuard)
export class TelegramLinkController {
  constructor(
    @InjectModel(TelegramLink.name) private telegramLinkModel: Model<TelegramLinkDocument>,
    private readonly telegramService: TelegramNotificationService,
  ) {}

  /**
   * Get linking code for user
   * User sends this code to bot to link their account
   */
  @Get('code')
  async getLinkCode(@Req() req: any) {
    const userId = req.user.id;
    
    // Generate unique code
    const code = `LINK-${userId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    
    // Store in cache (in real app, use Redis)
    // For now, return instructions
    return {
      code,
      instructions: {
        uk: `Надішліть цей код @Bibicars_bot: ${code}`,
        en: `Send this code to @Bibicars_bot: ${code}`,
      },
      expiresIn: '15 minutes',
    };
  }

  /**
   * Webhook from Telegram bot to link account
   * Bot calls this when user sends /start or link code
   */
  @Post('webhook')
  async telegramWebhook(@Body() body: any) {
    const { message, callback_query } = body;
    
    if (!message && !callback_query) {
      return { ok: true };
    }

    const chatId = message?.chat?.id || callback_query?.message?.chat?.id;
    const text = message?.text || '';
    const from = message?.from || callback_query?.from;

    // Handle /start command with deep link
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        // Deep link format: /start LINK-USERID-TIMESTAMP
        const linkCode = parts[1];
        return this.processLinkCode(chatId, linkCode, from);
      }
      
      // Regular /start - send welcome message
      await this.telegramService.send({
        chatId: String(chatId),
        text: '👋 Привіт! Я бот BIBI Cars CRM.\n\nЩоб підключити нотифікації, перейдіть в CRM → Налаштування → Telegram',
      });
      return { ok: true };
    }

    // Handle link code sent directly
    if (text.startsWith('LINK-')) {
      return this.processLinkCode(chatId, text, from);
    }

    // Handle callback queries (button clicks)
    if (callback_query) {
      await this.handleCallbackQuery(callback_query);
    }

    return { ok: true };
  }

  private async processLinkCode(chatId: number, code: string, from: any) {
    // Extract userId from code: LINK-USERID-TIMESTAMP
    const parts = code.split('-');
    if (parts.length < 2) {
      await this.telegramService.send({
        chatId: String(chatId),
        text: '❌ Невірний код. Будь ласка, отримайте новий код в CRM.',
      });
      return { ok: false };
    }

    // For demo, we'll accept any LINK code and create mapping
    // In production, validate against stored codes in Redis
    
    try {
      // Check if this chat is already linked
      const existing = await this.telegramLinkModel.findOne({ telegramChatId: String(chatId) });
      
      if (existing) {
        await this.telegramService.send({
          chatId: String(chatId),
          text: '✅ Цей Telegram вже підключено до CRM.\n\nВи отримуєте нотифікації.',
        });
        return { ok: true, alreadyLinked: true };
      }

      // Create new link
      const link = new this.telegramLinkModel({
        id: generateId(),
        userId: parts[1].toLowerCase(), // From link code
        telegramChatId: String(chatId),
        telegramUsername: from?.username,
        telegramFirstName: from?.first_name,
        telegramLastName: from?.last_name,
        isActive: true,
        notificationsEnabled: true,
        preferences: {
          leadAlerts: true,
          dealAlerts: true,
          priceAlerts: true,
          auctionAlerts: true,
        },
        linkedAt: new Date(),
      });

      await link.save();

      await this.telegramService.send({
        chatId: String(chatId),
        text: '✅ Telegram успішно підключено!\n\n🔔 Ви тепер будете отримувати:\n• Сповіщення про нові ліди\n• Алерти по угодам\n• Критичні нотифікації\n\n⚙️ Налаштувати сповіщення: CRM → Налаштування',
      });

      return { ok: true, linked: true };
    } catch (error: any) {
      console.error('Link error:', error);
      return { ok: false, error: error.message };
    }
  }

  private async handleCallbackQuery(query: any) {
    const { data, from, message } = query;
    const chatId = message?.chat?.id;

    // Handle button actions
    if (data.startsWith('call:')) {
      const entityId = data.split(':')[1];
      await this.telegramService.send({
        chatId: String(chatId),
        text: `📞 Відкриваю контакт ${entityId} в CRM...`,
      });
    }

    if (data.startsWith('assign:')) {
      const entityId = data.split(':')[1];
      await this.telegramService.send({
        chatId: String(chatId),
        text: `✅ Лід ${entityId} буде призначено вам`,
      });
    }
  }

  /**
   * Get current user's telegram link status
   */
  @Get('status')
  async getLinkStatus(@Req() req: any) {
    const link = await this.telegramLinkModel.findOne({ userId: req.user.id });
    
    return {
      isLinked: !!link,
      telegramUsername: link?.telegramUsername,
      notificationsEnabled: link?.notificationsEnabled ?? false,
      preferences: link?.preferences || {},
      linkedAt: link?.linkedAt,
    };
  }

  /**
   * Update notification preferences
   */
  @Post('preferences')
  async updatePreferences(
    @Req() req: any,
    @Body() body: {
      notificationsEnabled?: boolean;
      preferences?: {
        leadAlerts?: boolean;
        dealAlerts?: boolean;
        priceAlerts?: boolean;
        auctionAlerts?: boolean;
      };
    },
  ) {
    const link = await this.telegramLinkModel.findOne({ userId: req.user.id });
    
    if (!link) {
      return { error: 'Telegram not linked' };
    }

    if (body.notificationsEnabled !== undefined) {
      link.notificationsEnabled = body.notificationsEnabled;
    }

    if (body.preferences) {
      link.preferences = { ...link.preferences, ...body.preferences };
    }

    await link.save();
    return { success: true, preferences: link.preferences };
  }

  /**
   * Unlink telegram
   */
  @Delete('unlink')
  async unlinkTelegram(@Req() req: any) {
    const result = await this.telegramLinkModel.deleteOne({ userId: req.user.id });
    return { success: result.deletedCount > 0 };
  }

  /**
   * Admin: Get all linked accounts
   */
  @Get('admin/all')
  async getAllLinks(@Req() req: any) {
    if (!isOwner(req.user.role)) {
      return { error: 'Access denied' };
    }

    const links = await this.telegramLinkModel.find({ isActive: true }).sort({ linkedAt: -1 });
    return links;
  }

  /**
   * Test sending notification to user
   */
  @Post('test-send')
  async testSend(@Req() req: any) {
    const link = await this.telegramLinkModel.findOne({ userId: req.user.id });
    
    if (!link) {
      return { error: 'Telegram not linked' };
    }

    try {
      await this.telegramService.send({
        chatId: link.telegramChatId,
        text: '🧪 Тестове повідомлення з BIBI Cars CRM\n\n✅ Telegram працює коректно!',
      });
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }
}
