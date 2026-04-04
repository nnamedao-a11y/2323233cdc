/**
 * SMS Provider Manager - Orchestrates multiple SMS providers with fallback support
 * Handles provider selection, fallback logic, and delivery tracking
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SMSProvider,
  SMSProviderConfig,
  SendSMSRequest,
  SendSMSResponse,
} from './sms.provider.interface';
import { TwilioSMSProvider } from './twilio.provider';
import { ViberBusinessProvider } from './viber.provider';
import { Message } from '../schemas/message.schema';
import { CommunicationChannel } from '../../../shared/enums';
import { generateId } from '../../../shared/utils';

interface ProviderAttempt {
  providerName: string;
  success: boolean;
  response: SendSMSResponse;
  attemptedAt: Date;
}

@Injectable()
export class SMSProviderManager implements OnModuleInit {
  private readonly logger = new Logger(SMSProviderManager.name);
  private providers: Map<string, SMSProvider> = new Map();
  private providerPriority: string[] = []; // Ordered by priority

  constructor(
    private configService: ConfigService,
    private twilioProvider: TwilioSMSProvider,
    private viberProvider: ViberBusinessProvider,
    @InjectModel(Message.name) private messageModel: Model<Message>,
  ) {}

  async onModuleInit() {
    await this.initializeProviders();
  }

  private async initializeProviders(): Promise<void> {
    // Initialize Twilio
    const twilioConfig: SMSProviderConfig = {
      name: 'twilio',
      enabled: !!this.configService.get('TWILIO_ACCOUNT_SID'),
      priority: 1,
      credentials: {
        accountSid: this.configService.get('TWILIO_ACCOUNT_SID') || '',
        authToken: this.configService.get('TWILIO_AUTH_TOKEN') || '',
        fromNumber: this.configService.get('TWILIO_FROM_NUMBER') || '',
        messagingServiceSid: this.configService.get('TWILIO_MESSAGING_SERVICE_SID') || '',
      },
      options: {
        statusCallbackUrl: this.configService.get('TWILIO_STATUS_CALLBACK_URL'),
      },
    };

    await this.twilioProvider.initialize(twilioConfig);
    if (this.twilioProvider.isReady()) {
      this.providers.set('twilio', this.twilioProvider);
      this.providerPriority.push('twilio');
      this.logger.log('Twilio SMS provider registered');
    }

    // Initialize Viber (placeholder)
    const viberConfig: SMSProviderConfig = {
      name: 'viber',
      enabled: !!this.configService.get('VIBER_BUSINESS_ID'),
      priority: 2,
      credentials: {
        businessId: this.configService.get('VIBER_BUSINESS_ID') || '',
        serviceId: this.configService.get('VIBER_SERVICE_ID') || '',
        authToken: this.configService.get('VIBER_AUTH_TOKEN') || '',
        senderName: this.configService.get('VIBER_SENDER_NAME') || 'AutoCRM',
      },
    };

    await this.viberProvider.initialize(viberConfig);
    if (this.viberProvider.isReady()) {
      this.providers.set('viber', this.viberProvider);
      this.providerPriority.push('viber');
      this.logger.log('Viber Business provider registered');
    }

    this.logger.log(`SMS providers initialized: ${this.providerPriority.join(', ') || 'none'}`);
  }

  /**
   * Send SMS with automatic provider selection and fallback
   */
  async send(request: SendSMSRequest, preferredProvider?: string): Promise<SendSMSResponse> {
    const attempts: ProviderAttempt[] = [];
    
    // Determine provider order
    let providerOrder = [...this.providerPriority];
    if (preferredProvider && this.providers.has(preferredProvider)) {
      providerOrder = [preferredProvider, ...providerOrder.filter(p => p !== preferredProvider)];
    }

    if (providerOrder.length === 0) {
      return {
        success: false,
        providerName: 'none',
        status: 'failed',
        errorCode: 'NO_PROVIDERS',
        errorMessage: 'No SMS providers are configured. Please configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
      };
    }

    // Try each provider in order
    for (const providerName of providerOrder) {
      const provider = this.providers.get(providerName);
      if (!provider || !provider.isReady()) {
        continue;
      }

      try {
        const response = await provider.send(request);
        
        attempts.push({
          providerName,
          success: response.success,
          response,
          attemptedAt: new Date(),
        });

        // Log the communication
        await this.logCommunication(request, response, attempts);

        if (response.success) {
          return response;
        }
      } catch (error: any) {
        this.logger.error(`Provider ${providerName} failed: ${error.message}`);
        
        attempts.push({
          providerName,
          success: false,
          response: {
            success: false,
            providerName,
            status: 'failed',
            errorCode: 'EXCEPTION',
            errorMessage: error.message,
          },
          attemptedAt: new Date(),
        });
      }
    }

    // All providers failed
    const lastAttempt = attempts[attempts.length - 1];
    return lastAttempt?.response || {
      success: false,
      providerName: 'none',
      status: 'failed',
      errorCode: 'ALL_PROVIDERS_FAILED',
      errorMessage: `All ${attempts.length} provider attempts failed`,
    };
  }

  /**
   * Get available providers status
   */
  getProvidersStatus(): { name: string; ready: boolean; supportedCountries: string[] }[] {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      ready: provider.isReady(),
      supportedCountries: provider.supportedCountries,
    }));
  }

  /**
   * Validate phone number using first available provider
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    for (const provider of this.providers.values()) {
      return provider.validatePhoneNumber(phoneNumber);
    }
    // Default E.164 validation
    return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
  }

  /**
   * Log message to new Message schema with delivery tracking support
   */
  private async logCommunication(
    request: SendSMSRequest,
    response: SendSMSResponse,
    attempts: ProviderAttempt[],
  ): Promise<void> {
    try {
      const message = new this.messageModel({
        id: generateId(),
        leadId: request.metadata?.leadId,
        customerId: request.metadata?.customerId,
        channel: CommunicationChannel.SMS,
        provider: response.providerName || 'twilio',
        direction: 'outbound',
        to: request.to,
        content: request.message,
        templateId: request.templateId,
        providerMessageId: response.messageId,
        providerPayload: { attempts },
        status: response.success ? 'sent' : 'failed',
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
        sentAt: response.success ? new Date() : undefined,
        failedAt: !response.success ? new Date() : undefined,
        sentBy: 'system',
        metadata: request.metadata,
      });

      await message.save();
      this.logger.log(`Message logged: ${message.id} (provider: ${response.providerName})`);
    } catch (error) {
      this.logger.error(`Failed to log SMS message: ${error.message}`);
    }
  }
}
