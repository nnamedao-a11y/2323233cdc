/**
 * Viber Bot - Router Service
 * 
 * Simple dialog flows (not complex like Telegram)
 * Commands: MY_CARS, ORDERS, STATUS, MANAGER, LANG_BG, LANG_EN
 */

import { Injectable, Logger } from '@nestjs/common';
import { ViberService } from './viber.service';
import { ViberLinkService } from './viber-link.service';
import { mainButtons, languageButtons, t, Language } from './viber.templates';
import { CustomerCabinetService } from '../customer-cabinet/customer-cabinet.service';

// Pending links for deep linking
const pendingLinks = new Map<string, { customerId: string; expiresAt: Date }>();

@Injectable()
export class ViberRouterService {
  private readonly logger = new Logger(ViberRouterService.name);

  constructor(
    private readonly viber: ViberService,
    private readonly linkService: ViberLinkService,
    private readonly cabinetService: CustomerCabinetService,
  ) {}

  /**
   * Handle conversation started (first contact)
   */
  async handleConversationStarted(userId: string, context?: string): Promise<any> {
    // Check for deep link
    if (context?.startsWith('customer_')) {
      const customerId = context.replace('customer_', '');
      
      // Store pending link
      pendingLinks.set(userId, {
        customerId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    }

    // Return welcome message with language selection
    return {
      type: 'text',
      text: `${t('bg', 'welcome')}\n\n${t('bg', 'chooseLanguage')}`,
      keyboard: {
        Type: 'keyboard',
        DefaultHeight: false,
        Buttons: languageButtons(),
      },
    };
  }

  /**
   * Handle incoming message
   */
  async handleMessage(userId: string, text: string): Promise<void> {
    const user = await this.linkService.findByViberId(userId);
    const lang: Language = (user?.viberLanguage as Language) || 'bg';
    const msg = text.toUpperCase().trim();

    this.logger.debug(`Viber message from ${userId}: ${msg}`);

    // Language selection
    if (msg === 'LANG_BG' || msg === 'LANG_EN') {
      await this.handleLanguageSelection(userId, msg === 'LANG_BG' ? 'bg' : 'en');
      return;
    }

    // Main commands
    switch (msg) {
      case 'MY_CARS':
        await this.handleMyCars(userId, user, lang);
        break;
      case 'ORDERS':
        await this.handleOrders(userId, user, lang);
        break;
      case 'STATUS':
        await this.handleStatus(userId, user, lang);
        break;
      case 'MANAGER':
        await this.viber.sendText(userId, t(lang, 'manager'));
        break;
      case 'MENU':
      default:
        await this.showMainMenu(userId, lang);
        break;
    }
  }

  /**
   * Handle language selection
   */
  private async handleLanguageSelection(userId: string, language: Language): Promise<void> {
    // Check for pending link
    const pending = pendingLinks.get(userId);

    if (pending && pending.expiresAt > new Date()) {
      // Complete linking
      const result = await this.linkService.linkCustomerViber(
        pending.customerId,
        userId,
        language,
      );

      pendingLinks.delete(userId);

      if (result.success) {
        await this.viber.sendKeyboard(
          userId,
          t(language, 'linked'),
          mainButtons(language),
        );
      } else {
        await this.viber.sendText(userId, t(language, 'notLinked'));
      }
    } else {
      // Just update language for existing user
      const user = await this.linkService.findByViberId(userId);
      
      if (user) {
        await this.linkService.updateLanguage(userId, language);
        await this.viber.sendKeyboard(
          userId,
          t(language, 'chooseOption'),
          mainButtons(language),
        );
      } else {
        await this.viber.sendText(userId, t(language, 'notLinked'));
      }
    }
  }

  /**
   * Show main menu
   */
  private async showMainMenu(userId: string, lang: Language): Promise<void> {
    await this.viber.sendKeyboard(
      userId,
      t(lang, 'chooseOption'),
      mainButtons(lang),
    );
  }

  /**
   * Handle My Cars command
   */
  private async handleMyCars(userId: string, user: any, lang: Language): Promise<void> {
    if (!user) {
      await this.viber.sendText(userId, t(lang, 'notLinked'));
      return;
    }

    try {
      const customerId = user.id || String(user._id);
      const ordersData = await this.cabinetService.getOrders(customerId);
      const orders = ordersData.data || [];

      if (orders.length === 0) {
        await this.viber.sendKeyboard(userId, t(lang, 'noCars'), mainButtons(lang));
        return;
      }

      const text = orders
        .slice(0, 5)
        .map((o: any) => `🚗 ${o.vehicleTitle || o.title || 'Auto'}\nVIN: ${o.vin || 'N/A'}\n${o.status}`)
        .join('\n\n');

      await this.viber.sendKeyboard(userId, text, mainButtons(lang));
    } catch (error) {
      this.logger.error(`Error in handleMyCars: ${error}`);
      await this.viber.sendKeyboard(userId, t(lang, 'noCars'), mainButtons(lang));
    }
  }

  /**
   * Handle Orders command
   */
  private async handleOrders(userId: string, user: any, lang: Language): Promise<void> {
    if (!user) {
      await this.viber.sendText(userId, t(lang, 'notLinked'));
      return;
    }

    try {
      const customerId = user.id || String(user._id);
      const ordersData = await this.cabinetService.getOrders(customerId);
      const orders = ordersData.data || [];

      if (orders.length === 0) {
        await this.viber.sendKeyboard(userId, t(lang, 'noOrders'), mainButtons(lang));
        return;
      }

      const statusIcons: Record<string, string> = {
        new: '📝',
        negotiation: '💬',
        waiting_deposit: '⏳',
        deposit_paid: '✅',
        purchased: '🎉',
        in_delivery: '🚚',
        completed: '🏁',
      };

      const text = orders
        .slice(0, 5)
        .map((o: any) => {
          const icon = statusIcons[o.status] || '📦';
          return `${icon} ${o.vin || 'N/A'}\n${o.status}\n$${o.clientPrice || 0}`;
        })
        .join('\n\n');

      await this.viber.sendKeyboard(userId, `📦 ${lang === 'bg' ? 'Поръчки' : 'Orders'}:\n\n${text}`, mainButtons(lang));
    } catch (error) {
      this.logger.error(`Error in handleOrders: ${error}`);
      await this.viber.sendKeyboard(userId, t(lang, 'noOrders'), mainButtons(lang));
    }
  }

  /**
   * Handle Status command (latest order status)
   */
  private async handleStatus(userId: string, user: any, lang: Language): Promise<void> {
    if (!user) {
      await this.viber.sendText(userId, t(lang, 'notLinked'));
      return;
    }

    try {
      const customerId = user.id || String(user._id);
      const ordersData = await this.cabinetService.getOrders(customerId);
      const orders = ordersData.data || [];

      if (orders.length === 0) {
        await this.viber.sendKeyboard(userId, t(lang, 'noStatus'), mainButtons(lang));
        return;
      }

      const latest = orders[0];
      const text = [
        `📦 ${lang === 'bg' ? 'Последен статус' : 'Latest status'}`,
        '',
        `🚗 ${latest.vehicleTitle || latest.title || 'Auto'}`,
        `VIN: ${latest.vin || 'N/A'}`,
        `Status: ${latest.status}`,
        `💰 $${latest.clientPrice || 0}`,
      ].join('\n');

      await this.viber.sendKeyboard(userId, text, mainButtons(lang));
    } catch (error) {
      this.logger.error(`Error in handleStatus: ${error}`);
      await this.viber.sendKeyboard(userId, t(lang, 'noStatus'), mainButtons(lang));
    }
  }
}
