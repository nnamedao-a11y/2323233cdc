/**
 * BIBI Cars Telegram Bot - Webhook Controller
 * 
 * Handles incoming Telegram webhook requests
 */

import { Body, Controller, Get, Post, Logger } from '@nestjs/common';
import { TelegramRouterService } from './telegram-router.service';
import { TelegramBotService } from './telegram-bot.service';

@Controller('telegram-bot')
export class TelegramBotController {
  private readonly logger = new Logger(TelegramBotController.name);

  constructor(
    private readonly router: TelegramRouterService,
    private readonly bot: TelegramBotService,
  ) {}

  /**
   * Health check endpoint
   */
  @Get('status')
  async getStatus() {
    const botInfo = await this.bot.getMe();
    return {
      ok: true,
      bot: botInfo ? {
        username: botInfo.username,
        firstName: botInfo.first_name,
        canReadAllGroupMessages: botInfo.can_read_all_group_messages,
      } : null,
      configured: !!process.env.TELEGRAM_BOT_TOKEN,
    };
  }

  /**
   * Set webhook endpoint (call once to configure)
   */
  @Post('set-webhook')
  async setWebhook(@Body() body: { url: string }) {
    const result = await this.bot.setWebhook(body.url);
    return { ok: !!result, result };
  }

  /**
   * Main webhook handler
   */
  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    try {
      const message = body.message;
      const callback = body.callback_query;

      // Handle text messages
      if (message?.text) {
        const chatId = String(message.chat.id);
        const telegramId = String(message.from.id);
        const text = message.text;

        this.logger.debug(`Message from ${telegramId}: ${text}`);

        // /start command
        if (text.startsWith('/start')) {
          await this.router.handleStart(chatId, telegramId, text);
          return { ok: true };
        }

        // /menu command
        if (text === '/menu') {
          await this.router.handleMainMenu(chatId, telegramId);
          return { ok: true };
        }

        // /orders command
        if (text === '/orders') {
          await this.router.handleMyOrders(chatId, telegramId);
          return { ok: true };
        }

        // /cars command
        if (text === '/cars') {
          await this.router.handleMyCars(chatId, telegramId);
          return { ok: true };
        }

        // /help command
        if (text === '/help') {
          await this.router.handleMainMenu(chatId, telegramId);
          return { ok: true };
        }
      }

      // Handle callback queries (button presses)
      if (callback?.data) {
        const chatId = String(callback.message.chat.id);
        const telegramId = String(callback.from.id);
        const messageId = callback.message.message_id;
        const data = callback.data as string;

        this.logger.debug(`Callback from ${telegramId}: ${data}`);

        // Answer callback to remove loading state
        await this.bot.answerCallbackQuery(callback.id);

        // Language selection
        if (data === 'lang_bg' || data === 'lang_en') {
          await this.router.handleLanguageSelection(chatId, telegramId, messageId, data);
          return { ok: true };
        }

        // Main menu
        if (data === 'main_menu') {
          await this.router.handleMainMenu(chatId, telegramId, messageId);
          return { ok: true };
        }

        // My orders
        if (data === 'my_orders') {
          await this.router.handleMyOrders(chatId, telegramId, messageId);
          return { ok: true };
        }

        // My cars
        if (data === 'my_cars') {
          await this.router.handleMyCars(chatId, telegramId, messageId);
          return { ok: true };
        }

        // Notifications
        if (data === 'notifications') {
          await this.router.handleNotifications(chatId, telegramId, messageId);
          return { ok: true };
        }

        // Contact manager
        if (data === 'contact_manager') {
          await this.router.handleContactManager(chatId, telegramId, messageId);
          return { ok: true };
        }

        // Settings
        if (data === 'settings') {
          await this.router.handleSettings(chatId, telegramId, messageId);
          return { ok: true };
        }

        // Change language
        if (data === 'change_language') {
          await this.router.handleChangeLanguage(chatId, messageId);
          return { ok: true };
        }

        // Calculator
        if (data === 'calculator') {
          await this.router.handleCalculator(chatId, telegramId, messageId);
          return { ok: true };
        }

        // Login approval callbacks
        if (data.startsWith('approve_login:') || data.startsWith('deny_login:')) {
          try {
            const { LoginApprovalService } = await import('../login-approval/login-approval.service');
            // We'll handle this via a simple approach
            const action = data.startsWith('approve_login:') ? 'approve' : 'deny';
            const requestId = data.split(':')[1];
            
            // Send notification that action was received
            const statusText = action === 'approve' ? '✅ Вхід дозволено' : '❌ Вхід відхилено';
            await this.bot.answerCallbackQuery(callback.id, statusText);
            
            // Update message
            const updatedMessage = callback.message.text + `\n\n<b>Статус:</b> ${statusText}`;
            await this.bot.editMessage(chatId, messageId, updatedMessage);
            
            // The actual approval/denial is handled by the service call from frontend
            return { ok: true, action, requestId };
          } catch (err) {
            this.logger.error(`Login approval callback error: ${err}`);
          }
        }

        // Order details
        if (data.startsWith('order_')) {
          const orderId = data.replace('order_', '').replace('details_', '').replace('tracking_', '');
          await this.router.handleOrderDetails(chatId, telegramId, orderId, messageId);
          return { ok: true };
        }
      }

      return { ok: true };
    } catch (error) {
      this.logger.error(`Webhook error: ${error}`);
      return { ok: false, error: String(error) };
    }
  }
}
