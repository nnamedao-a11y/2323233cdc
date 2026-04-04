import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { TelegramLink, TelegramLinkDocument } from './schemas/telegram-link.schema';
import { v4 as uuidv4 } from 'uuid';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

/**
 * Telegram Service
 * 
 * Handles sending messages via Telegram Bot API
 */

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly apiUrl: string;

  constructor(
    @InjectModel(TelegramLink.name)
    private readonly linkModel: Model<TelegramLinkDocument>,
  ) {
    this.apiUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
  }

  /**
   * Send message to a specific chat
   */
  async sendMessage(chatId: string, text: string, parseMode = 'HTML'): Promise<boolean> {
    if (!TELEGRAM_TOKEN) {
      this.logger.warn('Telegram bot token not configured');
      return false;
    }

    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      });

      // Update last message time
      await this.linkModel.updateOne(
        { telegramChatId: chatId },
        { $set: { lastMessageAt: new Date() } },
      );

      this.logger.log(`Message sent to ${chatId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send message to ${chatId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Send message to user by userId or customerId
   */
  async sendToUser(userId: string, text: string): Promise<boolean> {
    const link = await this.linkModel.findOne({
      $or: [
        { userId, isActive: true, notificationsEnabled: true },
        { customerId: userId, isActive: true, notificationsEnabled: true },
      ],
    });

    if (!link) {
      this.logger.warn(`No Telegram link found for user ${userId}`);
      return false;
    }

    return this.sendMessage(link.telegramChatId, text);
  }

  /**
   * Send formatted notification
   */
  async sendNotification(params: {
    userId?: string;
    customerId?: string;
    title: string;
    message: string;
    link?: string;
    emoji?: string;
  }): Promise<boolean> {
    const telegramLink = await this.linkModel.findOne({
      $or: [
        { userId: params.userId, isActive: true, notificationsEnabled: true },
        { customerId: params.customerId, isActive: true, notificationsEnabled: true },
      ],
    });

    if (!telegramLink) {
      return false;
    }

    const emoji = params.emoji || '📣';
    let text = `${emoji} <b>${params.title}</b>\n\n${params.message}`;
    
    if (params.link) {
      text += `\n\n<a href="${params.link}">Переглянути →</a>`;
    }

    return this.sendMessage(telegramLink.telegramChatId, text);
  }

  /**
   * Link Telegram account to user
   */
  async linkAccount(params: {
    telegramChatId: string;
    telegramUsername?: string;
    telegramFirstName?: string;
    telegramLastName?: string;
    userId?: string;
    customerId?: string;
    linkCode?: string;
  }): Promise<TelegramLinkDocument> {
    // Check if already linked
    const existing = await this.linkModel.findOne({
      telegramChatId: params.telegramChatId,
    });

    if (existing) {
      // Update existing link
      existing.userId = params.userId || existing.userId;
      existing.customerId = params.customerId || existing.customerId;
      existing.telegramUsername = params.telegramUsername || existing.telegramUsername;
      existing.telegramFirstName = params.telegramFirstName || existing.telegramFirstName;
      existing.telegramLastName = params.telegramLastName || existing.telegramLastName;
      existing.isActive = true;
      await existing.save();
      return existing;
    }

    // Create new link
    return this.linkModel.create({
      id: uuidv4(),
      telegramChatId: params.telegramChatId,
      telegramUsername: params.telegramUsername,
      telegramFirstName: params.telegramFirstName,
      telegramLastName: params.telegramLastName,
      userId: params.userId,
      customerId: params.customerId,
      isActive: true,
      notificationsEnabled: true,
      linkedAt: new Date(),
      preferences: {
        auctionAlerts: true,
        priceAlerts: true,
        dealAlerts: true,
        leadAlerts: true,
        recommendations: true,
      },
    });
  }

  /**
   * Unlink Telegram account
   */
  async unlinkAccount(telegramChatId: string): Promise<boolean> {
    const result = await this.linkModel.updateOne(
      { telegramChatId },
      { $set: { isActive: false } },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Get link by chatId
   */
  async getLinkByChatId(chatId: string): Promise<TelegramLinkDocument | null> {
    return this.linkModel.findOne({ telegramChatId: chatId, isActive: true });
  }

  /**
   * Get link by userId or customerId
   */
  async getLinkByUserId(userId: string): Promise<TelegramLinkDocument | null> {
    return this.linkModel.findOne({
      $or: [
        { userId, isActive: true },
        { customerId: userId, isActive: true },
      ],
    });
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    chatId: string,
    preferences: Partial<TelegramLinkDocument['preferences']>,
  ): Promise<boolean> {
    const result = await this.linkModel.updateOne(
      { telegramChatId: chatId },
      { $set: { preferences } },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Check if Telegram is configured
   */
  isConfigured(): boolean {
    return !!TELEGRAM_TOKEN;
  }
}
