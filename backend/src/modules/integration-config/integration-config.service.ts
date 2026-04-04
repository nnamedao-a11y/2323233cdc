/**
 * Integration Config Service
 * 
 * Керує всіма зовнішніми інтеграціями:
 * - CRUD для конфігурацій
 * - Runtime config loading (DB → fallback .env)
 * - Health checks
 * - Test connections
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  IntegrationConfig,
  IntegrationProvider,
  IntegrationMode,
  HealthStatus,
} from './schemas/integration-config.schema';
import { EncryptionService } from './encryption.service';
import { SystemErrorService } from '../system-errors/system-error.service';
import axios from 'axios';

export interface IntegrationCredentials {
  [key: string]: string;
}

export interface IntegrationTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  details?: any;
}

@Injectable()
export class IntegrationConfigService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationConfigService.name);
  private configCache: Map<IntegrationProvider, IntegrationConfig> = new Map();

  constructor(
    @InjectModel(IntegrationConfig.name) private configModel: Model<IntegrationConfig>,
    private readonly encryption: EncryptionService,
    private readonly errorService: SystemErrorService,
  ) {}

  async onModuleInit() {
    await this.loadAllConfigs();
    await this.initializeDefaultConfigs();
  }

  /**
   * Load all configs into memory cache
   */
  private async loadAllConfigs(): Promise<void> {
    try {
      const configs = await this.configModel.find().lean();
      for (const config of configs) {
        this.configCache.set(config.provider as IntegrationProvider, config as IntegrationConfig);
      }
      this.logger.log(`Loaded ${configs.length} integration configs`);
    } catch (error) {
      this.logger.error(`Failed to load configs: ${error.message}`);
    }
  }

  /**
   * Initialize default configs from .env if not exist
   */
  private async initializeDefaultConfigs(): Promise<void> {
    const defaults: Partial<Record<IntegrationProvider, { credentials: Record<string, string>; settings: Record<string, any> }>> = {
      [IntegrationProvider.STRIPE]: {
        credentials: {
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
          secretKey: process.env.STRIPE_SECRET_KEY || '',
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        },
        settings: { currency: 'USD' },
      },
      [IntegrationProvider.TELEGRAM]: {
        credentials: {
          botToken: process.env.TELEGRAM_BOT_TOKEN || '',
          ownerChatId: process.env.TELEGRAM_OWNER_CHAT_ID || '',
        },
        settings: {},
      },
      [IntegrationProvider.RINGOSTAT]: {
        credentials: {
          apiKey: process.env.RINGOSTAT_API_KEY || '',
          projectId: process.env.RINGOSTAT_PROJECT_ID || '',
        },
        settings: {},
      },
      [IntegrationProvider.TWILIO]: {
        credentials: {
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
          authToken: process.env.TWILIO_AUTH_TOKEN || '',
          phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
        },
        settings: {},
      },
      [IntegrationProvider.VIBER]: {
        credentials: {
          token: process.env.VIBER_TOKEN || '',
        },
        settings: { senderName: 'BIBI Cars' },
      },
      [IntegrationProvider.DOCUSIGN]: {
        credentials: {
          integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY || '',
          clientSecret: process.env.DOCUSIGN_CLIENT_SECRET || '',
          accountId: process.env.DOCUSIGN_ACCOUNT_ID || '',
          userId: process.env.DOCUSIGN_USER_ID || '',
          privateKey: process.env.DOCUSIGN_PRIVATE_KEY || '',
          hmacKey: process.env.DOCUSIGN_HMAC_KEY || '',
        },
        settings: { 
          redirectUrl: process.env.DOCUSIGN_REDIRECT_URL || '',
          baseUrl: process.env.DOCUSIGN_BASE_URL || 'https://demo.docusign.net',
        },
      },
      [IntegrationProvider.SHIPPING]: {
        credentials: {
          apiKey: process.env.SHIPPING_API_KEY || '',
        },
        settings: {
          provider: 'manual', // manual | marinetraffic | shipsgo | searates
          pollingInterval: 30, // minutes
          autoTrackingEnabled: false,
        },
      },
      [IntegrationProvider.EMAIL]: {
        credentials: {
          smtpHost: process.env.SMTP_HOST || '',
          smtpPort: process.env.SMTP_PORT || '587',
          smtpLogin: process.env.SMTP_LOGIN || '',
          smtpPassword: process.env.SMTP_PASSWORD || '',
        },
        settings: { senderEmail: process.env.SENDER_EMAIL || 'noreply@bibi.cars' },
      },
      [IntegrationProvider.OPENAI]: {
        credentials: {
          apiKey: process.env.OPENAI_API_KEY || process.env.EMERGENT_API_KEY || '',
        },
        settings: { model: 'gpt-4o' },
      },
      // New integrations
      [IntegrationProvider.META_ADS]: {
        credentials: {
          accessToken: process.env.META_ADS_ACCESS_TOKEN || '',
          adAccountId: process.env.META_ADS_ACCOUNT_ID || '',
        },
        settings: {},
      },
      [IntegrationProvider.FACEBOOK_CAPI]: {
        credentials: {
          pixelId: process.env.FB_PIXEL_ID || '',
          accessToken: process.env.FB_CAPI_ACCESS_TOKEN || '',
        },
        settings: {},
      },
      [IntegrationProvider.ONE_C]: {
        credentials: {
          apiUrl: process.env.ONE_C_API_URL || '',
          apiKey: process.env.ONE_C_API_KEY || '',
        },
        settings: { syncInterval: 30 },
      },
      [IntegrationProvider.PNA]: {
        credentials: {
          apiKey: process.env.PNA_API_KEY || '',
          senderId: process.env.PNA_SENDER_ID || '',
        },
        settings: {},
      },
      [IntegrationProvider.CONTRACT_TEMPLATE]: {
        credentials: {
          templateUrl: process.env.CONTRACT_TEMPLATE_URL || '',
          templateId: process.env.DOCUSIGN_TEMPLATE_ID || '',
        },
        settings: { autoGenerate: false },
      },
    };

    for (const [provider, data] of Object.entries(defaults)) {
      const existing = await this.configModel.findOne({ provider });
      if (!existing) {
        const hasCredentials = Object.values(data.credentials).some(v => v && v.length > 0);
        await this.configModel.create({
          provider,
          credentials: this.encryption.encryptCredentials(data.credentials),
          settings: data.settings,
          mode: hasCredentials ? IntegrationMode.SANDBOX : IntegrationMode.DISABLED,
          isEnabled: hasCredentials,
          healthStatus: HealthStatus.UNKNOWN,
        });
        this.logger.log(`Created default config for ${provider}`);
      }
    }

    await this.loadAllConfigs(); // Reload cache
  }

  /**
   * Get config by provider (from cache or DB)
   */
  async getConfig(provider: IntegrationProvider): Promise<IntegrationConfig | null> {
    // Try cache first
    if (this.configCache.has(provider)) {
      return this.configCache.get(provider) || null;
    }

    // Load from DB
    const config = await this.configModel.findOne({ provider }).lean();
    if (config) {
      this.configCache.set(provider, config as IntegrationConfig);
      return config as IntegrationConfig;
    }
    return null;
  }

  /**
   * Get decrypted credentials for a provider
   */
  async getCredentials(provider: IntegrationProvider): Promise<IntegrationCredentials | null> {
    const config = await this.getConfig(provider);
    if (!config || !config.isEnabled) {
      return null;
    }
    return this.encryption.decryptCredentials(config.credentials);
  }

  /**
   * Get all configs (masked for admin display)
   */
  async getAllConfigs(): Promise<any[]> {
    const configs = await this.configModel.find().lean();
    return configs.map(config => ({
      ...config,
      credentials: this.maskCredentials(config.credentials),
    }));
  }

  /**
   * Update config
   */
  async updateConfig(
    provider: IntegrationProvider,
    data: {
      credentials?: Record<string, string>;
      settings?: Record<string, any>;
      mode?: IntegrationMode;
      isEnabled?: boolean;
    },
    updatedBy: string,
  ): Promise<IntegrationConfig> {
    const updateData: any = { updatedBy };

    if (data.credentials) {
      updateData.credentials = this.encryption.encryptCredentials(data.credentials);
    }
    if (data.settings) {
      updateData.settings = data.settings;
    }
    if (data.mode !== undefined) {
      updateData.mode = data.mode;
    }
    if (data.isEnabled !== undefined) {
      updateData.isEnabled = data.isEnabled;
    }

    const config = await this.configModel.findOneAndUpdate(
      { provider },
      updateData,
      { new: true, upsert: true },
    ).lean();

    // Update cache
    this.configCache.set(provider, config as IntegrationConfig);

    this.logger.log(`Updated config for ${provider} by ${updatedBy}`);
    return config as IntegrationConfig;
  }

  /**
   * Test integration connection
   */
  async testConnection(provider: IntegrationProvider): Promise<IntegrationTestResult> {
    const startTime = Date.now();

    try {
      const credentials = await this.getCredentials(provider);
      if (!credentials) {
        return { success: false, message: 'Integration not configured or disabled' };
      }

      let result: IntegrationTestResult;

      switch (provider) {
        case IntegrationProvider.STRIPE:
          result = await this.testStripe(credentials);
          break;
        case IntegrationProvider.TELEGRAM:
          result = await this.testTelegram(credentials);
          break;
        case IntegrationProvider.RINGOSTAT:
          result = await this.testRingostat(credentials);
          break;
        case IntegrationProvider.DOCUSIGN:
          result = await this.testDocusign(credentials);
          break;
        case IntegrationProvider.TWILIO:
          result = await this.testTwilio(credentials);
          break;
        case IntegrationProvider.VIBER:
          result = await this.testViber(credentials);
          break;
        case IntegrationProvider.EMAIL:
          result = await this.testEmail(credentials);
          break;
        case IntegrationProvider.SHIPPING:
          result = await this.testShipping(credentials);
          break;
        case IntegrationProvider.META_ADS:
          result = await this.testMetaAds(credentials);
          break;
        case IntegrationProvider.FACEBOOK_CAPI:
          result = await this.testFacebookCapi(credentials);
          break;
        case IntegrationProvider.ONE_C:
          result = await this.testOneC(credentials);
          break;
        case IntegrationProvider.PNA:
          result = await this.testPna(credentials);
          break;
        case IntegrationProvider.CONTRACT_TEMPLATE:
          result = await this.testContractTemplate(credentials);
          break;
        default:
          result = { success: false, message: 'Unknown provider' };
      }

      result.latencyMs = Date.now() - startTime;

      // Update health status
      await this.updateHealthStatus(provider, result.success ? HealthStatus.OK : HealthStatus.FAILED, result.message);

      return result;
    } catch (error) {
      const result = { success: false, message: error.message, latencyMs: Date.now() - startTime };
      await this.updateHealthStatus(provider, HealthStatus.FAILED, error.message);
      return result;
    }
  }

  /**
   * Update health status
   */
  private async updateHealthStatus(provider: IntegrationProvider, status: HealthStatus, error?: string): Promise<void> {
    const updateData: any = {
      healthStatus: status,
      lastHealthcheckAt: new Date(),
    };

    if (status === HealthStatus.OK) {
      updateData.lastSuccessfulCallAt = new Date();
      updateData.failedCallsCount = 0;
      updateData.lastHealthcheckError = null;
    } else {
      updateData.lastHealthcheckError = error;
      updateData.$inc = { failedCallsCount: 1 };
    }

    await this.configModel.updateOne({ provider }, updateData);

    // Update cache
    const config = await this.configModel.findOne({ provider }).lean();
    if (config) {
      this.configCache.set(provider, config as IntegrationConfig);
    }
  }

  // ==================== TEST METHODS ====================

  private async testStripe(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.secretKey) {
      return { success: false, message: 'Secret key not configured' };
    }

    try {
      const response = await axios.get('https://api.stripe.com/v1/balance', {
        auth: { username: credentials.secretKey, password: '' },
      });
      return {
        success: true,
        message: 'Connected to Stripe',
        details: { available: response.data.available },
      };
    } catch (error) {
      return { success: false, message: error.response?.data?.error?.message || error.message };
    }
  }

  private async testTelegram(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.botToken) {
      return { success: false, message: 'Bot token not configured' };
    }

    try {
      const response = await axios.get(`https://api.telegram.org/bot${credentials.botToken}/getMe`);
      return {
        success: response.data.ok,
        message: response.data.ok ? `Connected as @${response.data.result.username}` : 'Failed',
        details: response.data.result,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  private async testRingostat(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.apiKey) {
      return { success: false, message: 'API key not configured' };
    }

    // Ringostat API ping
    return { success: true, message: 'Ringostat configured (validation pending)' };
  }

  private async testDocusign(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.integrationKey || !credentials.accountId) {
      return { success: false, message: 'DocuSign credentials not configured' };
    }
    return { success: true, message: 'DocuSign configured (OAuth required for full test)' };
  }

  private async testTwilio(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.accountSid || !credentials.authToken) {
      return { success: false, message: 'Twilio credentials not configured' };
    }

    try {
      const response = await axios.get(
        `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}.json`,
        { auth: { username: credentials.accountSid, password: credentials.authToken } },
      );
      return {
        success: true,
        message: `Connected: ${response.data.friendly_name}`,
        details: { status: response.data.status },
      };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }

  private async testViber(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.token) {
      return { success: false, message: 'Viber token not configured' };
    }

    try {
      const response = await axios.post(
        'https://chatapi.viber.com/pa/get_account_info',
        {},
        { headers: { 'X-Viber-Auth-Token': credentials.token } },
      );
      return {
        success: response.data.status === 0,
        message: response.data.status === 0 ? `Connected: ${response.data.name}` : response.data.status_message,
        details: response.data,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  private async testEmail(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.smtpHost || !credentials.smtpLogin) {
      return { success: false, message: 'SMTP not configured' };
    }
    return { success: true, message: 'Email configured (send test email to verify)' };
  }

  private async testShipping(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    const config = await this.getConfig(IntegrationProvider.SHIPPING);
    const provider = config?.settings?.provider || 'manual';
    
    if (provider === 'manual') {
      return { success: true, message: 'Manual mode - no API required' };
    }

    if (!credentials.apiKey) {
      return { success: false, message: 'Shipping API key not configured' };
    }

    return { success: true, message: `${provider} configured` };
  }

  private async testMetaAds(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.accessToken || !credentials.adAccountId) {
      return { success: false, message: 'Meta Ads credentials not configured' };
    }

    try {
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/act_${credentials.adAccountId}`,
        {
          params: { access_token: credentials.accessToken, fields: 'name,account_status' },
        },
      );
      return {
        success: true,
        message: `Connected: ${response.data.name}`,
        details: response.data,
      };
    } catch (error) {
      return { success: false, message: error.response?.data?.error?.message || error.message };
    }
  }

  private async testFacebookCapi(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.pixelId || !credentials.accessToken) {
      return { success: false, message: 'Facebook CAPI credentials not configured' };
    }
    return { success: true, message: 'Facebook CAPI configured (events will verify)' };
  }

  private async testOneC(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.apiUrl || !credentials.apiKey) {
      return { success: false, message: '1C credentials not configured' };
    }

    try {
      const response = await axios.get(`${credentials.apiUrl}/ping`, {
        headers: { 'X-API-Key': credentials.apiKey },
        timeout: 5000,
      });
      return { success: true, message: '1C connected', details: response.data };
    } catch (error) {
      return { success: false, message: `1C connection failed: ${error.message}` };
    }
  }

  private async testPna(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.apiKey) {
      return { success: false, message: 'Nova Poshta API key not configured' };
    }

    try {
      const response = await axios.post('https://api.novaposhta.ua/v2.0/json/', {
        apiKey: credentials.apiKey,
        modelName: 'Address',
        calledMethod: 'getAreas',
        methodProperties: {},
      });
      return {
        success: response.data.success,
        message: response.data.success ? 'Nova Poshta connected' : 'Invalid API key',
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  private async testContractTemplate(credentials: IntegrationCredentials): Promise<IntegrationTestResult> {
    if (!credentials.templateId && !credentials.templateUrl) {
      return { success: false, message: 'Contract template not configured' };
    }
    return { 
      success: true, 
      message: credentials.templateId ? 'DocuSign template configured' : 'URL template configured',
    };
  }

  /**
   * Mask credentials for display
   */
  private maskCredentials(credentials: Record<string, string>): Record<string, string> {
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (value) {
        const decrypted = this.encryption.decrypt(value);
        masked[key] = this.encryption.maskValue(decrypted);
      } else {
        masked[key] = '';
      }
    }
    return masked;
  }

  /**
   * Healthcheck all integrations (CRON)
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async healthcheckAll(): Promise<void> {
    const configs = await this.configModel.find({ isEnabled: true }).lean();
    
    for (const config of configs) {
      try {
        await this.testConnection(config.provider as IntegrationProvider);
      } catch (error) {
        this.logger.error(`Healthcheck failed for ${config.provider}: ${error.message}`);
      }
    }
  }

  /**
   * Get health summary for all integrations
   */
  async getHealthSummary(): Promise<Record<string, { status: HealthStatus; mode?: IntegrationMode; isEnabled?: boolean; lastCheck?: Date; error?: string }>> {
    const configs = await this.configModel.find().lean();
    const summary: Record<string, any> = {};

    for (const config of configs) {
      summary[config.provider] = {
        status: config.isEnabled ? config.healthStatus : HealthStatus.NOT_CONFIGURED,
        mode: config.mode,
        isEnabled: config.isEnabled,
        lastCheck: config.lastHealthcheckAt,
        error: config.lastHealthcheckError,
      };
    }

    return summary;
  }
}
