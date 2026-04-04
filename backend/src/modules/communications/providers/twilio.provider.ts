/**
 * Twilio SMS Provider Implementation
 * Configured for Bulgaria market with E.164 phone format (+359XXXXXXXXX)
 * Supports delivery status webhooks and sender ID compliance
 */

import { Injectable, Logger } from '@nestjs/common';
import * as Twilio from 'twilio';
import {
  SMSProvider,
  SMSProviderConfig,
  SendSMSRequest,
  SendSMSResponse,
  DeliveryStatusUpdate,
} from './sms.provider.interface';

@Injectable()
export class TwilioSMSProvider implements SMSProvider {
  readonly name = 'twilio';
  readonly supportedCountries = ['BG', 'UA', 'US', 'GB', 'DE', 'PL']; // Bulgaria, Ukraine, etc.

  private readonly logger = new Logger(TwilioSMSProvider.name);
  private client: Twilio.Twilio | null = null;
  private config: SMSProviderConfig | null = null;
  private fromNumber: string = '';
  private messagingServiceSid: string = '';

  // Bulgaria-specific sender IDs
  private readonly senderIds: Record<string, string> = {
    BG: 'AutoCRM', // Alphanumeric sender ID for Bulgaria
    UA: 'AutoCRM',
    DEFAULT: '', // Will use Twilio number
  };

  async initialize(config: SMSProviderConfig): Promise<void> {
    this.config = config;
    
    const accountSid = config.credentials.accountSid;
    const authToken = config.credentials.authToken;
    this.fromNumber = config.credentials.fromNumber || '';
    this.messagingServiceSid = config.credentials.messagingServiceSid || '';

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio credentials not configured');
      return;
    }

    try {
      this.client = Twilio.default(accountSid, authToken);
      this.logger.log('Twilio SMS Provider initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Twilio: ${error.message}`);
      this.client = null;
    }
  }

  isReady(): boolean {
    return this.client !== null && this.config?.enabled === true;
  }

  async send(request: SendSMSRequest): Promise<SendSMSResponse> {
    if (!this.isReady()) {
      return {
        success: false,
        providerName: this.name,
        status: 'failed',
        errorCode: 'PROVIDER_NOT_READY',
        errorMessage: 'Twilio provider is not configured or enabled',
      };
    }

    // Validate phone number
    if (!this.validatePhoneNumber(request.to)) {
      return {
        success: false,
        providerName: this.name,
        status: 'failed',
        errorCode: 'INVALID_PHONE',
        errorMessage: 'Phone number must be in E.164 format (e.g., +359XXXXXXXXX)',
      };
    }

    try {
      const countryCode = this.extractCountryCode(request.to);
      const messageOptions: any = {
        to: request.to,
        body: request.message,
      };

      // Use messaging service or specific number
      if (this.messagingServiceSid) {
        messageOptions.messagingServiceSid = this.messagingServiceSid;
      } else if (this.fromNumber) {
        messageOptions.from = this.fromNumber;
      } else {
        // Try alphanumeric sender ID for supported countries
        const senderId = this.getSenderId(countryCode);
        if (senderId) {
          messageOptions.from = senderId;
        } else {
          return {
            success: false,
            providerName: this.name,
            status: 'failed',
            errorCode: 'NO_SENDER_ID',
            errorMessage: 'No sender ID configured for this country',
          };
        }
      }

      // Add status callback if configured
      if (this.config?.options?.statusCallbackUrl) {
        messageOptions.statusCallback = this.config.options.statusCallbackUrl;
      }

      const message = await this.client!.messages.create(messageOptions);

      this.logger.log(`SMS sent to ${request.to}, SID: ${message.sid}`);

      return {
        success: true,
        messageId: message.sid,
        providerName: this.name,
        status: this.mapTwilioStatus(message.status),
        segments: message.numSegments ? parseInt(message.numSegments) : 1,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send SMS: ${error.message}`);
      
      return {
        success: false,
        providerName: this.name,
        status: 'failed',
        errorCode: error.code?.toString() || 'SEND_FAILED',
        errorMessage: error.message,
      };
    }
  }

  async getStatus(messageId: string): Promise<DeliveryStatusUpdate> {
    if (!this.isReady()) {
      return {
        messageId,
        status: 'failed',
        timestamp: new Date(),
        errorMessage: 'Provider not ready',
      };
    }

    try {
      const message = await this.client!.messages(messageId).fetch();
      
      return {
        messageId,
        status: this.mapTwilioStatus(message.status),
        timestamp: new Date(message.dateUpdated || message.dateSent || Date.now()),
        errorCode: message.errorCode?.toString(),
        errorMessage: message.errorMessage || undefined,
      };
    } catch (error: any) {
      return {
        messageId,
        status: 'failed',
        timestamp: new Date(),
        errorCode: error.code?.toString(),
        errorMessage: error.message,
      };
    }
  }

  validatePhoneNumber(phoneNumber: string): boolean {
    // E.164 format: +[country code][number]
    // Bulgaria: +359XXXXXXXXX (10-12 digits after +359)
    // General: 8-15 digits total
    const e164Regex = /^\+[1-9]\d{7,14}$/;
    return e164Regex.test(phoneNumber);
  }

  getSenderId(countryCode: string): string {
    return this.senderIds[countryCode] || this.senderIds.DEFAULT || this.fromNumber;
  }

  private extractCountryCode(phoneNumber: string): string {
    // Map country calling codes to ISO codes
    const countryMap: Record<string, string> = {
      '359': 'BG', // Bulgaria
      '380': 'UA', // Ukraine
      '1': 'US',
      '44': 'GB',
      '49': 'DE',
      '48': 'PL',
    };

    const number = phoneNumber.replace('+', '');
    
    for (const [code, country] of Object.entries(countryMap)) {
      if (number.startsWith(code)) {
        return country;
      }
    }
    
    return 'DEFAULT';
  }

  private mapTwilioStatus(status: string): SendSMSResponse['status'] {
    const statusMap: Record<string, SendSMSResponse['status']> = {
      queued: 'queued',
      sending: 'queued',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'undelivered',
      failed: 'failed',
    };
    return statusMap[status] || 'queued';
  }
}
