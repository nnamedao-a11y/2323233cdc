/**
 * DocuSign Auth Service
 * 
 * Handles JWT authentication with DocuSign API
 * Uses OAuth JWT Grant flow for server-to-server auth
 * Now loads credentials from IntegrationConfigService (DB) with .env fallback
 */

import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';

// DocuSign types (simplified for TypeScript)
interface ApiClient {
  setBasePath(path: string): void;
  setOAuthBasePath(path: string): void;
  requestJWTUserToken(
    clientId: string,
    userId: string,
    scopes: string[],
    privateKey: Buffer,
    expiresIn: number
  ): Promise<any>;
  addDefaultHeader(name: string, value: string): void;
}

interface DocuSignCredentials {
  integrationKey?: string;
  userId?: string;
  privateKey?: string;
  accountId?: string;
}

interface DocuSignSettings {
  baseUrl?: string;
  redirectUrl?: string;
}

@Injectable()
export class DocusignAuthService implements OnModuleInit {
  private readonly logger = new Logger(DocusignAuthService.name);
  private cachedClient: any = null;
  private tokenExpiry: Date | null = null;
  private credentials: DocuSignCredentials | null = null;
  private settings: DocuSignSettings | null = null;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => IntegrationConfigService))
    private integrationConfigService: IntegrationConfigService,
  ) {}

  async onModuleInit() {
    await this.loadCredentials();
  }

  /**
   * Load credentials from DB (IntegrationConfig) with .env fallback
   */
  private async loadCredentials(): Promise<void> {
    try {
      const dbCreds = await this.integrationConfigService.getCredentials(IntegrationProvider.DOCUSIGN);
      const config = await this.integrationConfigService.getConfig(IntegrationProvider.DOCUSIGN);
      
      // Load private key from file if path provided
      let privateKey = dbCreds?.privateKey || this.configService.get<string>('DOCUSIGN_PRIVATE_KEY');
      const privateKeyPath = this.configService.get<string>('DOCUSIGN_PRIVATE_KEY_PATH');
      
      if (!privateKey && privateKeyPath) {
        try {
          const fs = await import('fs');
          privateKey = fs.readFileSync(privateKeyPath, 'utf8');
          this.logger.log('Loaded DocuSign private key from file');
        } catch (e) {
          this.logger.warn(`Failed to load private key from ${privateKeyPath}: ${e.message}`);
        }
      }
      
      this.credentials = {
        integrationKey: dbCreds?.integrationKey || this.configService.get<string>('DOCUSIGN_INTEGRATION_KEY'),
        userId: dbCreds?.userId || this.configService.get<string>('DOCUSIGN_USER_ID'),
        privateKey: privateKey,
        accountId: dbCreds?.accountId || this.configService.get<string>('DOCUSIGN_ACCOUNT_ID'),
      };

      this.settings = {
        baseUrl: config?.settings?.baseUrl || this.configService.get<string>('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net',
        redirectUrl: config?.settings?.redirectUrl || this.configService.get<string>('DOCUSIGN_REDIRECT_URL'),
      };

      if (this.isConfigured()) {
        this.logger.log('DocuSign credentials loaded from DB/env');
      } else {
        this.logger.warn('DocuSign credentials not configured');
      }
    } catch (error) {
      this.logger.error(`Failed to load DocuSign credentials: ${error.message}`);
    }
  }

  /**
   * Refresh credentials from DB
   */
  async refreshCredentials(): Promise<void> {
    this.cachedClient = null;
    this.tokenExpiry = null;
    await this.loadCredentials();
  }

  /**
   * Exchange authorization code for access token (Authorization Code Grant)
   * Used when user grants consent via OAuth flow
   */
  async exchangeCodeForToken(code: string, redirectUri?: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    userInfo?: any;
  }> {
    const { integrationKey } = this.credentials || {};
    const baseUrl = this.settings?.baseUrl || 'https://demo.docusign.net';
    const oauthBase = baseUrl.includes('demo') ? 'account-d.docusign.com' : 'account.docusign.com';
    const redirect = redirectUri || this.settings?.redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/docusign/callback`;

    // Get client secret from credentials
    const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.DOCUSIGN);
    const clientSecret = credentials?.clientSecret || this.configService.get<string>('DOCUSIGN_CLIENT_SECRET');

    if (!integrationKey || !clientSecret) {
      throw new Error('DocuSign client credentials not configured');
    }

    try {
      const axios = (await import('axios')).default;
      
      // Exchange code for token
      const tokenResponse = await axios.post(
        `https://${oauthBase}/oauth/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirect,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${integrationKey}:${clientSecret}`).toString('base64')}`,
          },
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Get user info
      const userInfoResponse = await axios.get(
        `https://${oauthBase}/oauth/userinfo`,
        {
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );

      this.logger.log('DocuSign OAuth token obtained successfully');

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        userInfo: userInfoResponse.data,
      };
    } catch (error) {
      this.logger.error(`DocuSign OAuth token exchange failed: ${error.message}`);
      throw new Error(`OAuth token exchange failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get OAuth consent URL for JWT Grant
   * User must grant consent once before JWT can impersonate them
   */
  getConsentUrl(redirectUri?: string): string {
    const integrationKey = this.credentials?.integrationKey;
    const baseUrl = this.settings?.baseUrl || 'https://demo.docusign.net';
    const oauthBase = baseUrl.includes('demo') ? 'account-d.docusign.com' : 'account.docusign.com';
    const redirect = redirectUri || this.settings?.redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/docusign/callback`;

    return `https://${oauthBase}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${integrationKey}&redirect_uri=${encodeURIComponent(redirect)}`;
  }

  /**
   * Get authenticated DocuSign API client
   * Caches client for 50 minutes (tokens last 1 hour)
   */
  async getApiClient(): Promise<any> {
    // Check if we have a valid cached client
    if (this.cachedClient && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.cachedClient;
    }

    if (!this.credentials) {
      await this.loadCredentials();
    }

    const { integrationKey, userId, privateKey } = this.credentials || {};
    const baseUrl = this.settings?.baseUrl || 'https://demo.docusign.net';
    const basePath = `${baseUrl}/restapi`;
    const oauthBase = baseUrl.includes('demo') ? 'account-d.docusign.com' : 'account.docusign.com';

    if (!integrationKey || !userId || !privateKey) {
      this.logger.warn('DocuSign credentials not configured - using mock mode');
      return null;
    }

    try {
      // Dynamic import to avoid issues when SDK not configured
      const docusign = await import('docusign-esign');
      
      const apiClient = new docusign.ApiClient();
      apiClient.setBasePath(basePath);
      apiClient.setOAuthBasePath(oauthBase);

      // Request JWT token
      const results = await apiClient.requestJWTUserToken(
        integrationKey,
        userId,
        ['signature', 'impersonation'],
        Buffer.from(privateKey.replace(/\\n/g, '\n')),
        3600,
      );

      const accessToken = results.body.access_token;
      apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

      // Cache client for 50 minutes
      this.cachedClient = apiClient;
      this.tokenExpiry = new Date(Date.now() + 50 * 60 * 1000);

      this.logger.log('DocuSign API client authenticated successfully');
      return apiClient;
    } catch (error) {
      // Check for consent_required error
      if (error.message?.includes('consent_required') || error.response?.body?.error === 'consent_required') {
        this.logger.warn('DocuSign consent required - user must authorize first');
        throw new Error(`consent_required:${this.getConsentUrl()}`);
      }
      this.logger.error(`DocuSign auth failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if DocuSign is properly configured
   */
  isConfigured(): boolean {
    if (!this.credentials) return false;
    return !!(
      this.credentials.integrationKey && 
      this.credentials.userId && 
      this.credentials.privateKey && 
      this.credentials.accountId
    );
  }

  /**
   * Get DocuSign account ID
   */
  getAccountId(): string {
    return this.credentials?.accountId || this.configService.get<string>('DOCUSIGN_ACCOUNT_ID') || '';
  }

  /**
   * Get return URL for signing completion
   */
  getReturnUrl(): string {
    return this.settings?.redirectUrl || 
           this.configService.get<string>('DOCUSIGN_RETURN_URL') || 
           `${process.env.FRONTEND_URL || 'http://localhost:3000'}/cabinet/contracts/return`;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.settings?.baseUrl || 'https://demo.docusign.net';
  }
}
