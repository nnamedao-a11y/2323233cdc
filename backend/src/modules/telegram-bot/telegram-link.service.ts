/**
 * BIBI Cars Telegram Bot - Link Service
 * 
 * Handles customer ↔ telegramId linking
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Language } from './telegram-bot.i18n';

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    @InjectModel('Customer') private readonly customerModel: Model<any>,
  ) {}

  /**
   * Link customer account to Telegram
   */
  async linkCustomerTelegram(
    customerId: string,
    telegramId: string,
    language: Language = 'bg',
  ): Promise<{ success: boolean; customer?: any; error?: string }> {
    try {
      // Find customer by custom id or ObjectId
      let customer = await this.customerModel.findOne({ id: customerId });
      
      if (!customer && /^[a-f\d]{24}$/i.test(customerId)) {
        customer = await this.customerModel.findById(customerId);
      }

      if (!customer) {
        this.logger.warn(`Customer not found for linking: ${customerId}`);
        return { success: false, error: 'Customer not found' };
      }

      // Check if already linked to different telegram
      if (customer.telegramId && customer.telegramId !== telegramId) {
        this.logger.warn(`Customer ${customerId} already linked to different telegram`);
        // Update to new telegram (user might have changed account)
      }

      // Update customer with telegram info
      customer.telegramId = telegramId;
      customer.telegramLanguage = language;
      customer.telegramLinkedAt = new Date();
      await customer.save();

      this.logger.log(`Customer ${customerId} linked to Telegram ${telegramId}`);

      return {
        success: true,
        customer: {
          id: customer.id || String(customer._id),
          name: customer.name,
          email: customer.email,
          telegramId: customer.telegramId,
          language: customer.telegramLanguage,
        },
      };
    } catch (error) {
      this.logger.error(`Error linking customer: ${error}`);
      return { success: false, error: 'Link failed' };
    }
  }

  /**
   * Find customer by Telegram ID
   */
  async findByTelegramId(telegramId: string): Promise<any | null> {
    try {
      const customer = await this.customerModel.findOne({ telegramId }).lean();
      return customer;
    } catch (error) {
      this.logger.error(`Error finding customer by telegramId: ${error}`);
      return null;
    }
  }

  /**
   * Update customer language preference
   */
  async updateLanguage(telegramId: string, language: Language): Promise<boolean> {
    try {
      const result = await this.customerModel.updateOne(
        { telegramId },
        { $set: { telegramLanguage: language } },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(`Error updating language: ${error}`);
      return false;
    }
  }

  /**
   * Get customer language or default
   */
  async getLanguage(telegramId: string): Promise<Language> {
    const customer = await this.findByTelegramId(telegramId);
    return (customer?.telegramLanguage as Language) || 'bg';
  }

  /**
   * Unlink Telegram from customer
   */
  async unlinkTelegram(telegramId: string): Promise<boolean> {
    try {
      const result = await this.customerModel.updateOne(
        { telegramId },
        { 
          $unset: { telegramId: 1 },
          $set: { telegramUnlinkedAt: new Date() },
        },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(`Error unlinking telegram: ${error}`);
      return false;
    }
  }

  /**
   * Check if customer is linked
   */
  async isLinked(telegramId: string): Promise<boolean> {
    const customer = await this.findByTelegramId(telegramId);
    return !!customer;
  }
}
