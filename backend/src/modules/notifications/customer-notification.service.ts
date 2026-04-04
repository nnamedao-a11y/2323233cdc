/**
 * Customer Notification Service
 * 
 * Sends real-time notifications to customers via:
 * - WebSocket (instant in-app)
 * - Telegram (if customer has linked bot)
 * - Email (for important updates)
 * 
 * Notification Types:
 * - Shipment status changed
 * - ETA changed
 * - Shipment arrived
 * - Invoice paid
 * - Contract signed
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationsGateway } from './notifications.gateway';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { ShipmentStatus } from '../shipping/shipment.schema';

// Status labels in Ukrainian
const STATUS_LABELS: Record<string, string> = {
  [ShipmentStatus.DEAL_CREATED]: 'Угоду створено',
  [ShipmentStatus.CONTRACT_SIGNED]: 'Контракт підписано',
  [ShipmentStatus.DEPOSIT_PAID]: 'Депозит оплачено',
  [ShipmentStatus.LOT_PAID]: 'Лот оплачено',
  [ShipmentStatus.TRANSPORT_TO_PORT]: 'Транспортування в порт',
  [ShipmentStatus.AT_ORIGIN_PORT]: 'В порту відправлення',
  [ShipmentStatus.LOADED_ON_VESSEL]: 'Завантажено на судно',
  [ShipmentStatus.IN_TRANSIT]: 'В дорозі',
  [ShipmentStatus.AT_DESTINATION_PORT]: 'Прибуло в порт призначення',
  [ShipmentStatus.CUSTOMS]: 'На митниці',
  [ShipmentStatus.READY_FOR_PICKUP]: 'Готово до видачі',
  [ShipmentStatus.DELIVERED]: 'Доставлено',
  [ShipmentStatus.CANCELLED]: 'Скасовано',
};

interface CustomerNotificationPrefs {
  telegramChatId?: string;
  email?: string;
  enableWebSocket: boolean;
  enableTelegram: boolean;
  enableEmail: boolean;
}

@Injectable()
export class CustomerNotificationService {
  private readonly logger = new Logger(CustomerNotificationService.name);

  constructor(
    @InjectModel('Customer') private customerModel: Model<any>,
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway: NotificationsGateway,
    @Inject(forwardRef(() => TelegramBotService))
    private telegramService: TelegramBotService,
  ) {}

  /**
   * Notify customer about shipment status change
   */
  async notifyShipmentStatusChanged(params: {
    userId: string;
    customerId?: string;
    shipmentId: string;
    vin: string;
    vehicleTitle?: string;
    oldStatus: string;
    newStatus: string;
  }): Promise<void> {
    const { userId, customerId, shipmentId, vin, vehicleTitle, oldStatus, newStatus } = params;
    
    const statusLabel = STATUS_LABELS[newStatus] || newStatus;
    const oldStatusLabel = STATUS_LABELS[oldStatus] || oldStatus;

    // WebSocket notification (always try)
    this.notificationsGateway.emitShipmentStatusChanged(userId, {
      shipmentId,
      vin,
      oldStatus,
      newStatus,
      statusLabel,
    });

    // Get customer preferences
    const prefs = await this.getCustomerPrefs(customerId || userId);

    // Telegram notification
    if (prefs?.enableTelegram && prefs?.telegramChatId) {
      await this.sendTelegramNotification(prefs.telegramChatId, {
        type: 'status_changed',
        title: '📦 Статус доставки оновлено',
        message: this.buildStatusChangeMessage(vin, vehicleTitle, oldStatusLabel, statusLabel),
      });
    }

    // Check for special statuses that require extra notification
    if (newStatus === ShipmentStatus.AT_DESTINATION_PORT) {
      await this.notifyShipmentArrived({ userId, customerId, shipmentId, vin, vehicleTitle, port: '' });
    }

    if (newStatus === ShipmentStatus.READY_FOR_PICKUP) {
      await this.notifyReadyForPickup({ userId, customerId, shipmentId, vin, vehicleTitle });
    }

    this.logger.log(`Notified customer ${userId} about status change: ${oldStatus} → ${newStatus}`);
  }

  /**
   * Notify customer about ETA change
   */
  async notifyEtaChanged(params: {
    userId: string;
    customerId?: string;
    shipmentId: string;
    vin: string;
    vehicleTitle?: string;
    oldEta: string | null;
    newEta: string | null;
  }): Promise<void> {
    const { userId, customerId, shipmentId, vin, vehicleTitle, oldEta, newEta } = params;

    const formattedEta = newEta ? this.formatDate(newEta) : 'Невизначено';
    const formattedOldEta = oldEta ? this.formatDate(oldEta) : 'Невизначено';

    // WebSocket notification
    this.notificationsGateway.emitEtaChanged(userId, {
      shipmentId,
      vin,
      oldEta,
      newEta,
      formattedEta,
    });

    // Get customer preferences
    const prefs = await this.getCustomerPrefs(customerId || userId);

    // Telegram notification
    if (prefs?.enableTelegram && prefs?.telegramChatId) {
      await this.sendTelegramNotification(prefs.telegramChatId, {
        type: 'eta_changed',
        title: '📅 Дата прибуття змінилась',
        message: this.buildEtaChangeMessage(vin, vehicleTitle, formattedOldEta, formattedEta),
      });
    }

    this.logger.log(`Notified customer ${userId} about ETA change: ${oldEta} → ${newEta}`);
  }

  /**
   * Notify customer that shipment arrived
   */
  async notifyShipmentArrived(params: {
    userId: string;
    customerId?: string;
    shipmentId: string;
    vin: string;
    vehicleTitle?: string;
    port: string;
  }): Promise<void> {
    const { userId, customerId, shipmentId, vin, vehicleTitle, port } = params;

    // WebSocket notification
    this.notificationsGateway.emitShipmentArrived(userId, {
      shipmentId,
      vin,
      vehicleTitle: vehicleTitle || vin,
      port,
    });

    // Get customer preferences
    const prefs = await this.getCustomerPrefs(customerId || userId);

    // Telegram notification (high priority - always send)
    if (prefs?.telegramChatId) {
      await this.sendTelegramNotification(prefs.telegramChatId, {
        type: 'arrived',
        title: '🎉 Ваше авто прибуло!',
        message: `Чудові новини! Ваш автомобіль ${vehicleTitle || vin} прибув у порт${port ? ` ${port}` : ''}!\n\nНайближчим часом з вами зв'яжеться менеджер для організації доставки.`,
      });
    }

    this.logger.log(`Notified customer ${userId} about arrival: ${vin}`);
  }

  /**
   * Notify customer that car is ready for pickup
   */
  async notifyReadyForPickup(params: {
    userId: string;
    customerId?: string;
    shipmentId: string;
    vin: string;
    vehicleTitle?: string;
  }): Promise<void> {
    const { userId, customerId, vin, vehicleTitle } = params;

    // WebSocket notification
    this.notificationsGateway.emitEventToUser(userId, 'shipment:ready_for_pickup', {
      vin,
      vehicleTitle: vehicleTitle || vin,
    });

    // Get customer preferences
    const prefs = await this.getCustomerPrefs(customerId || userId);

    // Telegram notification (high priority)
    if (prefs?.telegramChatId) {
      await this.sendTelegramNotification(prefs.telegramChatId, {
        type: 'ready_for_pickup',
        title: '🚗 Авто готове до видачі!',
        message: `Ваш автомобіль ${vehicleTitle || vin} готовий до видачі!\n\nЗв'яжіться з нами для узгодження часу та місця отримання.\n\n📞 Контакти в особистому кабінеті.`,
      });
    }

    this.logger.log(`Notified customer ${userId} about ready for pickup: ${vin}`);
  }

  /**
   * Send generic notification to customer
   */
  async sendNotification(params: {
    userId: string;
    customerId?: string;
    title: string;
    message: string;
    type?: string;
    data?: any;
  }): Promise<void> {
    const { userId, customerId, title, message, type, data } = params;

    // WebSocket
    this.notificationsGateway.emitEventToUser(userId, 'notification', {
      title,
      message,
      type,
      data,
      timestamp: new Date().toISOString(),
    });

    // Telegram (if configured)
    const prefs = await this.getCustomerPrefs(customerId || userId);
    if (prefs?.enableTelegram && prefs?.telegramChatId) {
      await this.sendTelegramNotification(prefs.telegramChatId, {
        type: type || 'info',
        title,
        message,
      });
    }
  }

  /**
   * Get customer notification preferences
   */
  private async getCustomerPrefs(customerId: string): Promise<CustomerNotificationPrefs | null> {
    try {
      const customer = await this.customerModel.findOne({
        $or: [{ id: customerId }, { userId: customerId }],
      });

      if (!customer) return null;

      return {
        telegramChatId: customer.telegramChatId,
        email: customer.email,
        enableWebSocket: true, // Always enabled
        enableTelegram: !!customer.telegramChatId,
        enableEmail: customer.notificationPrefs?.email !== false,
      };
    } catch (error) {
      this.logger.error(`Failed to get customer prefs: ${error.message}`);
      return null;
    }
  }

  /**
   * Send Telegram notification
   */
  private async sendTelegramNotification(chatId: string, notification: {
    type: string;
    title: string;
    message: string;
  }): Promise<void> {
    if (!this.telegramService.isConfigured()) {
      this.logger.warn('Telegram not configured, skipping notification');
      return;
    }

    try {
      const text = `<b>${notification.title}</b>\n\n${notification.message}`;
      await this.telegramService.sendMessage({
        chatId,
        text,
        parseMode: 'HTML',
      });
    } catch (error) {
      this.logger.error(`Failed to send Telegram notification: ${error.message}`);
    }
  }

  /**
   * Build status change message
   */
  private buildStatusChangeMessage(
    vin: string,
    vehicleTitle: string | undefined,
    oldStatus: string,
    newStatus: string,
  ): string {
    const vehicle = vehicleTitle || vin;
    return `Статус доставки вашого автомобіля <b>${vehicle}</b> змінився:\n\n` +
           `📍 ${oldStatus} → <b>${newStatus}</b>\n\n` +
           `Відстежуйте доставку в особистому кабінеті BIBI Cars.`;
  }

  /**
   * Build ETA change message
   */
  private buildEtaChangeMessage(
    vin: string,
    vehicleTitle: string | undefined,
    oldEta: string,
    newEta: string,
  ): string {
    const vehicle = vehicleTitle || vin;
    return `Орієнтовна дата прибуття вашого автомобіля <b>${vehicle}</b> змінилась:\n\n` +
           `📅 ${oldEta} → <b>${newEta}</b>\n\n` +
           `Ми повідомимо вас про прибуття.`;
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }
}
