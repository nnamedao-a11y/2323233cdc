/**
 * Viber Bot - Link Service
 * 
 * Handles customer ↔ viberId linking
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class ViberLinkService {
  private readonly logger = new Logger(ViberLinkService.name);

  constructor(
    @InjectModel('Customer') private readonly customerModel: Model<any>,
  ) {}

  /**
   * Link customer account to Viber
   */
  async linkCustomerViber(
    customerId: string,
    viberId: string,
    language: 'bg' | 'en' = 'bg',
  ): Promise<{ success: boolean; customer?: any; error?: string }> {
    try {
      // Find customer
      let customer = await this.customerModel.findOne({ id: customerId });
      
      if (!customer && /^[a-f\d]{24}$/i.test(customerId)) {
        customer = await this.customerModel.findById(customerId);
      }

      if (!customer) {
        this.logger.warn(`Customer not found for Viber linking: ${customerId}`);
        return { success: false, error: 'Customer not found' };
      }

      // Update with Viber info
      customer.viberId = viberId;
      customer.viberLanguage = language;
      customer.viberLinkedAt = new Date();
      await customer.save();

      this.logger.log(`Customer ${customerId} linked to Viber ${viberId}`);

      return {
        success: true,
        customer: {
          id: customer.id || String(customer._id),
          name: customer.name,
          viberId: customer.viberId,
          language: customer.viberLanguage,
        },
      };
    } catch (error) {
      this.logger.error(`Error linking Viber: ${error}`);
      return { success: false, error: 'Link failed' };
    }
  }

  /**
   * Find customer by Viber ID
   */
  async findByViberId(viberId: string): Promise<any | null> {
    try {
      return await this.customerModel.findOne({ viberId }).lean();
    } catch (error) {
      this.logger.error(`Error finding customer by viberId: ${error}`);
      return null;
    }
  }

  /**
   * Update language preference
   */
  async updateLanguage(viberId: string, language: 'bg' | 'en'): Promise<boolean> {
    try {
      const result = await this.customerModel.updateOne(
        { viberId },
        { $set: { viberLanguage: language } },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error(`Error updating Viber language: ${error}`);
      return false;
    }
  }

  /**
   * Get customer language
   */
  async getLanguage(viberId: string): Promise<'bg' | 'en'> {
    const customer = await this.findByViberId(viberId);
    return (customer?.viberLanguage as 'bg' | 'en') || 'bg';
  }

  /**
   * Check if linked
   */
  async isLinked(viberId: string): Promise<boolean> {
    const customer = await this.findByViberId(viberId);
    return !!customer;
  }
}
