import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import axios from 'axios';

/**
 * Facebook Event Types
 */
export type FacebookEventType = 
  | 'PageView'
  | 'ViewContent'
  | 'Search'
  | 'Lead'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'Purchase';

/**
 * Facebook User Data (hashed)
 */
export interface FacebookUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  country?: string;
  externalId?: string;
  fbclid?: string;
  fbc?: string; // Facebook click ID cookie
  fbp?: string; // Facebook browser ID cookie
}

/**
 * Facebook Event Data
 */
export interface FacebookEventData {
  eventName: FacebookEventType;
  eventId?: string; // For deduplication
  userData: FacebookUserData;
  customData?: {
    value?: number;
    currency?: string;
    contentName?: string;
    contentCategory?: string;
    contentIds?: string[];
    contentType?: string;
    searchString?: string;
  };
  eventSourceUrl?: string;
  actionSource?: 'website' | 'app' | 'email' | 'phone_call';
}

/**
 * Facebook Conversion API Service
 * 
 * Sends server-side events to Facebook for better optimization
 * 
 * Credentials can be configured via:
 * 1. Environment variables (FB_PIXEL_ID, FB_ACCESS_TOKEN)
 * 2. Admin Settings panel (stored in MongoDB)
 */
@Injectable()
export class FacebookConversionService {
  private readonly logger = new Logger(FacebookConversionService.name);
  private readonly apiVersion = 'v18.0';

  // Cached credentials from DB
  private dbPixelId: string = '';
  private dbAccessToken: string = '';

  constructor(
    @InjectModel('Setting') private settingModel: Model<any>,
  ) {}

  /**
   * Refresh credentials from database
   */
  private async refreshCredentials(): Promise<void> {
    try {
      const pixelSetting = await this.settingModel.findOne({ key: 'fb_pixel_id' });
      const tokenSetting = await this.settingModel.findOne({ key: 'fb_access_token' });
      this.dbPixelId = pixelSetting?.value || '';
      this.dbAccessToken = tokenSetting?.value || '';
    } catch (e) {
      // Silently fail - will use env vars
    }
  }

  private get pixelId(): string {
    return this.dbPixelId || process.env.FB_PIXEL_ID || '';
  }

  private get accessToken(): string {
    return this.dbAccessToken || process.env.FB_ACCESS_TOKEN || '';
  }

  /**
   * Check if Facebook CAPI is configured
   */
  isConfigured(): boolean {
    return !!(this.pixelId && this.accessToken);
  }

  /**
   * Send event to Facebook
   */
  async sendEvent(data: FacebookEventData): Promise<boolean> {
    await this.refreshCredentials();
    
    if (!this.isConfigured()) {
      this.logger.debug('Facebook CAPI not configured, skipping event');
      return false;
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.pixelId}/events`;

      const payload = {
        data: [{
          event_name: data.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: data.eventId || this.generateEventId(),
          action_source: data.actionSource || 'website',
          event_source_url: data.eventSourceUrl,
          user_data: this.buildUserData(data.userData),
          custom_data: data.customData ? {
            value: data.customData.value,
            currency: data.customData.currency || 'USD',
            content_name: data.customData.contentName,
            content_category: data.customData.contentCategory,
            content_ids: data.customData.contentIds,
            content_type: data.customData.contentType,
            search_string: data.customData.searchString,
          } : undefined,
        }],
        access_token: this.accessToken,
      };

      const response = await axios.post(url, payload);

      if (response.data?.events_received) {
        this.logger.log(`FB CAPI: ${data.eventName} event sent successfully`);
        return true;
      }

      return false;
    } catch (error: any) {
      this.logger.error(`FB CAPI error: ${error.response?.data?.error?.message || error.message}`);
      return false;
    }
  }

  /**
   * Track Lead event
   */
  async trackLead(lead: {
    email?: string;
    phone?: string;
    name?: string;
    value?: number;
    leadId: string;
    source?: string;
  }): Promise<boolean> {
    const [firstName, ...lastNameParts] = (lead.name || '').split(' ');
    
    return this.sendEvent({
      eventName: 'Lead',
      eventId: `lead_${lead.leadId}`,
      userData: {
        email: lead.email,
        phone: lead.phone,
        firstName,
        lastName: lastNameParts.join(' '),
        externalId: lead.leadId,
      },
      customData: {
        value: lead.value || 0,
        currency: 'USD',
        contentCategory: lead.source || 'website',
      },
    });
  }

  /**
   * Track Quote/InitiateCheckout event
   */
  async trackQuote(quote: {
    email?: string;
    phone?: string;
    quoteId: string;
    vehicleTitle?: string;
    value: number;
  }): Promise<boolean> {
    return this.sendEvent({
      eventName: 'InitiateCheckout',
      eventId: `quote_${quote.quoteId}`,
      userData: {
        email: quote.email,
        phone: quote.phone,
        externalId: quote.quoteId,
      },
      customData: {
        value: quote.value,
        currency: 'USD',
        contentName: quote.vehicleTitle,
        contentType: 'vehicle',
      },
    });
  }

  /**
   * Track Purchase/Deal event
   */
  async trackPurchase(deal: {
    email?: string;
    phone?: string;
    customerId?: string;
    dealId: string;
    vehicleTitle?: string;
    revenue: number;
    profit?: number;
  }): Promise<boolean> {
    return this.sendEvent({
      eventName: 'Purchase',
      eventId: `deal_${deal.dealId}`,
      userData: {
        email: deal.email,
        phone: deal.phone,
        externalId: deal.customerId,
      },
      customData: {
        value: deal.revenue,
        currency: 'USD',
        contentName: deal.vehicleTitle,
        contentType: 'vehicle',
      },
    });
  }

  /**
   * Track VIN Search
   */
  async trackSearch(search: {
    vin: string;
    email?: string;
    sessionId?: string;
  }): Promise<boolean> {
    return this.sendEvent({
      eventName: 'Search',
      eventId: `search_${search.vin}_${Date.now()}`,
      userData: {
        email: search.email,
        externalId: search.sessionId,
      },
      customData: {
        searchString: search.vin,
        contentCategory: 'vin_search',
      },
    });
  }

  /**
   * Track ViewContent (car view)
   */
  async trackViewContent(view: {
    vehicleId: string;
    vehicleTitle?: string;
    price?: number;
    email?: string;
    sessionId?: string;
  }): Promise<boolean> {
    return this.sendEvent({
      eventName: 'ViewContent',
      eventId: `view_${view.vehicleId}_${Date.now()}`,
      userData: {
        email: view.email,
        externalId: view.sessionId,
      },
      customData: {
        value: view.price,
        currency: 'USD',
        contentName: view.vehicleTitle,
        contentIds: [view.vehicleId],
        contentType: 'vehicle',
      },
    });
  }

  /**
   * Build hashed user data
   */
  private buildUserData(data: FacebookUserData): Record<string, string | undefined> {
    return {
      em: data.email ? this.hash(data.email.toLowerCase().trim()) : undefined,
      ph: data.phone ? this.hash(this.normalizePhone(data.phone)) : undefined,
      fn: data.firstName ? this.hash(data.firstName.toLowerCase().trim()) : undefined,
      ln: data.lastName ? this.hash(data.lastName.toLowerCase().trim()) : undefined,
      ct: data.city ? this.hash(data.city.toLowerCase().trim()) : undefined,
      country: data.country ? this.hash(data.country.toLowerCase().trim()) : undefined,
      external_id: data.externalId ? this.hash(data.externalId) : undefined,
      fbc: data.fbc,
      fbp: data.fbp,
    };
  }

  /**
   * SHA256 hash
   */
  private hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Normalize phone number
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
