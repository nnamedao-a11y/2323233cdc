/**
 * SMS Provider Interface - Abstract contract for all SMS providers
 * Designed for provider-agnostic communication layer
 * Supports Bulgaria market compliance and future Viber Business integration
 */

export interface SMSProviderConfig {
  name: string;
  enabled: boolean;
  priority: number; // Lower = higher priority for fallback
  credentials: Record<string, string>;
  options?: Record<string, any>;
}

export interface SendSMSRequest {
  to: string; // E.164 format: +359XXXXXXXXX for Bulgaria
  message: string;
  templateId?: string;
  variables?: Record<string, any>;
  metadata?: {
    leadId?: string;
    customerId?: string;
    campaignId?: string;
    attemptNumber?: number;
  };
}

export interface SendSMSResponse {
  success: boolean;
  messageId?: string;
  providerName: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  errorCode?: string;
  errorMessage?: string;
  cost?: number;
  currency?: string;
  segments?: number;
}

export interface DeliveryStatusUpdate {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
}

export interface SMSProvider {
  readonly name: string;
  readonly supportedCountries: string[]; // ISO country codes
  
  /**
   * Initialize the provider with configuration
   */
  initialize(config: SMSProviderConfig): Promise<void>;
  
  /**
   * Check if provider is properly configured and ready
   */
  isReady(): boolean;
  
  /**
   * Send SMS message
   */
  send(request: SendSMSRequest): Promise<SendSMSResponse>;
  
  /**
   * Get delivery status for a message
   */
  getStatus(messageId: string): Promise<DeliveryStatusUpdate>;
  
  /**
   * Validate phone number format
   */
  validatePhoneNumber(phoneNumber: string): boolean;
  
  /**
   * Get provider-specific sender ID for country
   */
  getSenderId(countryCode: string): string;
}

/**
 * Messaging Provider Interface - Generic for SMS, Viber, WhatsApp etc.
 */
export interface MessagingProvider extends SMSProvider {
  readonly channelType: 'sms' | 'viber' | 'whatsapp' | 'telegram';
}

/**
 * Provider Factory Interface
 */
export interface ProviderFactory {
  createProvider(type: string, config: SMSProviderConfig): SMSProvider;
  getAvailableProviders(): string[];
}
