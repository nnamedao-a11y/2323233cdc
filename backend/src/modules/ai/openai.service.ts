/**
 * OpenAI Service with Runtime Config
 * 
 * Loads credentials from IntegrationConfigService (DB) with fallback to .env
 * Provides controlled error handling when API is disabled/unavailable
 */

import { Injectable, Logger, ServiceUnavailableException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';

@Injectable()
export class OpenAIService implements OnModuleInit {
  private readonly logger = new Logger(OpenAIService.name);
  private client: OpenAI | null = null;
  private lastInitAt: Date | null = null;
  private isEnabled: boolean = false;

  constructor(
    private configService: ConfigService,
    private integrationConfigService: IntegrationConfigService,
  ) {}

  async onModuleInit() {
    await this.initializeClient();
  }

  /**
   * Initialize OpenAI client with credentials from DB or .env
   */
  private async initializeClient(): Promise<void> {
    try {
      const config = await this.integrationConfigService.getConfig(IntegrationProvider.OPENAI);
      
      // Check if integration is enabled
      if (config && !config.isEnabled) {
        this.logger.warn('OpenAI integration is disabled in admin settings');
        this.isEnabled = false;
        this.client = null;
        return;
      }

      const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.OPENAI);
      const apiKey = credentials?.apiKey 
        || this.configService.get<string>('OPENAI_API_KEY');

      if (apiKey && apiKey.length > 10) {
        this.client = new OpenAI({ apiKey });
        this.isEnabled = true;
        this.lastInitAt = new Date();
        this.logger.log('OpenAI client initialized with credentials from DB/env');
      } else {
        this.logger.warn('OpenAI API key not configured');
        this.isEnabled = false;
        this.client = null;
      }
    } catch (error) {
      this.logger.error(`Failed to initialize OpenAI: ${error.message}`);
      this.isEnabled = false;
      this.client = null;
    }
  }

  /**
   * Get OpenAI client, re-initialize if needed (every 5 minutes)
   */
  async getClient(): Promise<OpenAI> {
    // Re-initialize if older than 5 minutes (to pick up config changes)
    const now = new Date();
    if (!this.lastInitAt || (now.getTime() - this.lastInitAt.getTime() > 5 * 60 * 1000)) {
      await this.initializeClient();
    }

    if (!this.client || !this.isEnabled) {
      throw new ServiceUnavailableException('OpenAI service is not available');
    }

    return this.client;
  }

  /**
   * Check if OpenAI is available
   */
  isAvailable(): boolean {
    return this.isEnabled && this.client !== null;
  }

  /**
   * Generate chat completion
   */
  async chatCompletion(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const client = await this.getClient();
    
    const response = await client.chat.completions.create({
      model: params.model || 'gpt-4o',
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1000,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    isAvailable: boolean;
    isEnabled: boolean;
    lastInitAt: Date | null;
    error?: string;
  }> {
    return {
      isAvailable: this.isAvailable(),
      isEnabled: this.isEnabled,
      lastInitAt: this.lastInitAt,
    };
  }
}
