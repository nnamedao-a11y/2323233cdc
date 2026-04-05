/**
 * BIBI Cars Telegram Bot - Router Service
 * 
 * Handles all bot interactions and routing
 */

import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLinkService } from './telegram-link.service';
import { t, Language, getStatusText } from './telegram-bot.i18n';
import {
  mainMenu,
  languageMenu,
  backMenu,
  settingsMenu,
  ordersListMenu,
  carsListMenu,
  notificationsMenu,
  orderMenu,
} from './telegram-bot.menu';
import { CustomerCabinetService } from '../customer-cabinet/customer-cabinet.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

// Temporary storage for pending links (in production use Redis)
const pendingLinks = new Map<string, { customerId: string; expiresAt: Date }>();

@Injectable()
export class TelegramRouterService {
  private readonly logger = new Logger(TelegramRouterService.name);

  constructor(
    private readonly bot: TelegramBotService,
    private readonly linkService: TelegramLinkService,
    private readonly cabinetService: CustomerCabinetService,
    @InjectModel('Notification') private readonly notificationModel: Model<any>,
    @InjectModel('CustomerSavedListing') private readonly savedModel: Model<any>,
  ) {}

  // ============ START COMMAND ============
  async handleStart(chatId: string, telegramId: string, text: string): Promise<void> {
    const payload = text.split(' ')[1];

    if (payload?.startsWith('customer_')) {
      // Deep link from website
      const customerId = payload.replace('customer_', '');
      
      // Store pending link (expires in 10 minutes)
      pendingLinks.set(telegramId, {
        customerId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      await this.bot.sendMessage({
        chatId,
        text: `${t('bg', 'welcome')}\n\n${t('bg', 'chooseLang')}`,
        replyMarkup: languageMenu(),
      });
    } else {
      // Regular start - check if already linked
      const customer = await this.linkService.findByTelegramId(telegramId);

      if (customer) {
        const lang = (customer.telegramLanguage as Language) || 'bg';
        await this.bot.sendMessage({
          chatId,
          text: t(lang, 'helpText'),
          replyMarkup: mainMenu(lang),
        });
      } else {
        await this.bot.sendMessage({
          chatId,
          text: `${t('bg', 'welcome')}\n\n${t('bg', 'notLinked')}\n\n${t('bg', 'linkInstruction')}`,
          replyMarkup: languageMenu(),
        });
      }
    }
  }

  // ============ LANGUAGE SELECTION ============
  async handleLanguageSelection(
    chatId: string,
    telegramId: string,
    messageId: number,
    langCode: 'lang_bg' | 'lang_en',
  ): Promise<void> {
    const language: Language = langCode === 'lang_bg' ? 'bg' : 'en';

    // Check for pending link
    const pending = pendingLinks.get(telegramId);
    
    if (pending && pending.expiresAt > new Date()) {
      // Complete the linking
      const result = await this.linkService.linkCustomerTelegram(
        pending.customerId,
        telegramId,
        language,
      );

      pendingLinks.delete(telegramId);

      if (result.success) {
        await this.bot.editMessage(
          chatId,
          messageId,
          `${t(language, 'linked')}\n\n${t(language, 'mainMenu')}`,
          mainMenu(language),
        );
      } else {
        await this.bot.editMessage(
          chatId,
          messageId,
          t(language, 'linkError'),
          languageMenu(),
        );
      }
    } else {
      // Just update language for existing user
      const customer = await this.linkService.findByTelegramId(telegramId);
      
      if (customer) {
        await this.linkService.updateLanguage(telegramId, language);
        await this.bot.editMessage(
          chatId,
          messageId,
          t(language, 'mainMenu'),
          mainMenu(language),
        );
      } else {
        await this.bot.editMessage(
          chatId,
          messageId,
          `${t(language, 'notLinked')}\n\n${t(language, 'linkInstruction')}`,
        );
      }
    }
  }

  // ============ MAIN MENU ============
  async handleMainMenu(chatId: string, telegramId: string, messageId?: number): Promise<void> {
    const lang = await this.linkService.getLanguage(telegramId);

    if (messageId) {
      await this.bot.editMessage(chatId, messageId, t(lang, 'mainMenu'), mainMenu(lang));
    } else {
      await this.bot.sendMessage({
        chatId,
        text: t(lang, 'mainMenu'),
        replyMarkup: mainMenu(lang),
      });
    }
  }

  // ============ MY ORDERS ============
  async handleMyOrders(chatId: string, telegramId: string, messageId?: number): Promise<void> {
    const customer = await this.linkService.findByTelegramId(telegramId);
    const lang = (customer?.telegramLanguage as Language) || 'bg';

    if (!customer) {
      await this.sendNotLinkedMessage(chatId, lang, messageId);
      return;
    }

    try {
      const customerId = customer.id || String(customer._id);
      const ordersData = await this.cabinetService.getOrders(customerId);
      const orders = ordersData.data || [];

      if (orders.length === 0) {
        const text = t(lang, 'noOrders');
        if (messageId) {
          await this.bot.editMessage(chatId, messageId, text, backMenu(lang));
        } else {
          await this.bot.sendMessage({ chatId, text, replyMarkup: backMenu(lang) });
        }
        return;
      }

      const text = `📦 ${t(lang, 'myOrders')} (${orders.length})`;
      const keyboard = ordersListMenu(lang, orders);

      if (messageId) {
        await this.bot.editMessage(chatId, messageId, text, keyboard);
      } else {
        await this.bot.sendMessage({ chatId, text, replyMarkup: keyboard });
      }
    } catch (error) {
      this.logger.error(`Error loading orders: ${error}`);
      await this.bot.sendMessage({
        chatId,
        text: '❌ Error loading orders',
        replyMarkup: backMenu(lang),
      });
    }
  }

  // ============ ORDER DETAILS ============
  async handleOrderDetails(
    chatId: string,
    telegramId: string,
    orderId: string,
    messageId?: number,
  ): Promise<void> {
    const customer = await this.linkService.findByTelegramId(telegramId);
    const lang = (customer?.telegramLanguage as Language) || 'bg';

    if (!customer) {
      await this.sendNotLinkedMessage(chatId, lang, messageId);
      return;
    }

    try {
      const customerId = customer.id || String(customer._id);
      const orderData = await this.cabinetService.getOrderDetails(customerId, orderId);
      const deal = orderData.deal;

      const statusText = getStatusText(lang, deal.status);
      const text = [
        `<b>${t(lang, 'orderStatus')}</b>`,
        '',
        `🚗 ${deal.vehicleTitle || deal.title || 'Auto'}`,
        `VIN: <code>${deal.vin || 'N/A'}</code>`,
        '',
        `📊 ${statusText}`,
        `💰 $${deal.clientPrice || 0}`,
        '',
        deal.processState
          ? this.formatProcessState(deal.processState)
          : '',
      ].filter(Boolean).join('\n');

      const keyboard = orderMenu(lang, orderId);

      if (messageId) {
        await this.bot.editMessage(chatId, messageId, text, keyboard);
      } else {
        await this.bot.sendMessage({ chatId, text, replyMarkup: keyboard });
      }
    } catch (error) {
      this.logger.error(`Error loading order details: ${error}`);
      await this.bot.sendMessage({
        chatId,
        text: '❌ Order not found',
        replyMarkup: backMenu(lang),
      });
    }
  }

  // ============ MY CARS (SAVED) ============
  async handleMyCars(chatId: string, telegramId: string, messageId?: number): Promise<void> {
    const customer = await this.linkService.findByTelegramId(telegramId);
    const lang = (customer?.telegramLanguage as Language) || 'bg';

    if (!customer) {
      await this.sendNotLinkedMessage(chatId, lang, messageId);
      return;
    }

    try {
      const customerId = customer.id || String(customer._id);
      const saved = await this.savedModel
        .find({ customerId })
        .sort({ savedAt: -1 })
        .limit(10)
        .lean();

      if (saved.length === 0) {
        const text = t(lang, 'noCars');
        if (messageId) {
          await this.bot.editMessage(chatId, messageId, text, backMenu(lang));
        } else {
          await this.bot.sendMessage({ chatId, text, replyMarkup: backMenu(lang) });
        }
        return;
      }

      const text = `🚗 ${t(lang, 'myCars')} (${saved.length})`;
      const keyboard = carsListMenu(lang, saved);

      if (messageId) {
        await this.bot.editMessage(chatId, messageId, text, keyboard);
      } else {
        await this.bot.sendMessage({ chatId, text, replyMarkup: keyboard });
      }
    } catch (error) {
      this.logger.error(`Error loading cars: ${error}`);
      await this.bot.sendMessage({
        chatId,
        text: t(lang, 'noCars'),
        replyMarkup: backMenu(lang),
      });
    }
  }

  // ============ NOTIFICATIONS ============
  async handleNotifications(chatId: string, telegramId: string, messageId?: number): Promise<void> {
    const customer = await this.linkService.findByTelegramId(telegramId);
    const lang = (customer?.telegramLanguage as Language) || 'bg';

    if (!customer) {
      await this.sendNotLinkedMessage(chatId, lang, messageId);
      return;
    }

    try {
      const customerId = customer.id || String(customer._id);
      const notifications = await this.notificationModel
        .find({ customerId, isRead: false })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (notifications.length === 0) {
        const text = t(lang, 'noNotifications');
        if (messageId) {
          await this.bot.editMessage(chatId, messageId, text, backMenu(lang));
        } else {
          await this.bot.sendMessage({ chatId, text, replyMarkup: backMenu(lang) });
        }
        return;
      }

      const text = `🔔 ${t(lang, 'notifications')} (${notifications.length})`;
      const keyboard = notificationsMenu(lang, notifications);

      if (messageId) {
        await this.bot.editMessage(chatId, messageId, text, keyboard);
      } else {
        await this.bot.sendMessage({ chatId, text, replyMarkup: keyboard });
      }
    } catch (error) {
      this.logger.error(`Error loading notifications: ${error}`);
      await this.bot.sendMessage({
        chatId,
        text: t(lang, 'noNotifications'),
        replyMarkup: backMenu(lang),
      });
    }
  }

  // ============ CONTACT MANAGER ============
  async handleContactManager(chatId: string, telegramId: string, messageId?: number): Promise<void> {
    const customer = await this.linkService.findByTelegramId(telegramId);
    const lang = (customer?.telegramLanguage as Language) || 'bg';

    if (!customer) {
      await this.sendNotLinkedMessage(chatId, lang, messageId);
      return;
    }

    // In production, fetch actual manager data
    const text = [
      `<b>${t(lang, 'managerInfo')}</b>`,
      '',
      '👤 BIBI Cars Manager',
      '📞 +380 XX XXX XXXX',
      '📧 manager@bibi-cars.com',
      '',
      `${t(lang, 'contactManager')}`,
    ].join('\n');

    if (messageId) {
      await this.bot.editMessage(chatId, messageId, text, backMenu(lang));
    } else {
      await this.bot.sendMessage({ chatId, text, replyMarkup: backMenu(lang) });
    }
  }

  // ============ SETTINGS ============
  async handleSettings(chatId: string, telegramId: string, messageId?: number): Promise<void> {
    const lang = await this.linkService.getLanguage(telegramId);
    const text = t(lang, 'settings');

    if (messageId) {
      await this.bot.editMessage(chatId, messageId, text, settingsMenu(lang));
    } else {
      await this.bot.sendMessage({ chatId, text, replyMarkup: settingsMenu(lang) });
    }
  }

  // ============ CHANGE LANGUAGE ============
  async handleChangeLanguage(chatId: string, messageId?: number): Promise<void> {
    const text = 'Choose language / Изберете език:';
    
    if (messageId) {
      await this.bot.editMessage(chatId, messageId, text, languageMenu());
    } else {
      await this.bot.sendMessage({ chatId, text, replyMarkup: languageMenu() });
    }
  }

  // ============ CALCULATOR ============
  async handleCalculator(chatId: string, telegramId: string, messageId?: number): Promise<void> {
    const lang = await this.linkService.getLanguage(telegramId);
    const siteUrl = process.env.PUBLIC_SITE_URL || 'https://competitor-inventory.preview.emergentagent.com';
    
    const text = [
      `💰 ${t(lang, 'calculator')}`,
      '',
      lang === 'bg'
        ? 'Използвайте калкулатора на сайта за точна оценка:'
        : 'Use the calculator on our website for accurate estimation:',
      '',
      `${siteUrl}/calculator`,
    ].join('\n');

    if (messageId) {
      await this.bot.editMessage(chatId, messageId, text, backMenu(lang));
    } else {
      await this.bot.sendMessage({ chatId, text, replyMarkup: backMenu(lang) });
    }
  }

  // ============ HELPERS ============
  private async sendNotLinkedMessage(chatId: string, lang: Language, messageId?: number): Promise<void> {
    const text = `${t(lang, 'notLinked')}\n\n${t(lang, 'linkInstruction')}`;
    
    if (messageId) {
      await this.bot.editMessage(chatId, messageId, text);
    } else {
      await this.bot.sendMessage({ chatId, text });
    }
  }

  private formatProcessState(processState: any[]): string {
    return processState
      .map((step: any) => {
        const icon = step.completed ? '✅' : step.current ? '🔵' : '⬜';
        return `${icon} ${step.label}`;
      })
      .join('\n');
  }
}
