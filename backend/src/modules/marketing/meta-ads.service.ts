/**
 * Meta Ads API Service
 * 
 * Fetches campaign insights (spend, clicks, impressions) from Meta Ads API
 * Enables ROI calculation with real spend data
 * 
 * Credentials can be configured via:
 * 1. Environment variables (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID)
 * 2. Admin Settings panel (stored in MongoDB)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';

export interface CampaignInsight {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  date_start: string;
  date_stop: string;
}

export interface AdSetInfo {
  id: string;
  name: string;
  campaign_id: string;
  daily_budget: number;
  status: string;
}

@Injectable()
export class MetaAdsService {
  private readonly logger = new Logger(MetaAdsService.name);
  private readonly apiVersion = 'v18.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  // Cached credentials from DB
  private dbAccessToken: string = '';
  private dbAdAccountId: string = '';

  constructor(
    private configService: ConfigService,
    @InjectModel('Setting') private settingModel: Model<any>,
  ) {}

  /**
   * Refresh credentials from database
   */
  private async refreshCredentials(): Promise<void> {
    try {
      const tokenSetting = await this.settingModel.findOne({ key: 'meta_access_token' });
      const accountSetting = await this.settingModel.findOne({ key: 'meta_ad_account_id' });
      this.dbAccessToken = tokenSetting?.value || '';
      this.dbAdAccountId = accountSetting?.value || '';
    } catch (e) {
      // Silently fail - will use env vars
    }
  }

  private get accessToken(): string {
    // Priority: DB > ENV
    return this.dbAccessToken || this.configService.get<string>('META_ACCESS_TOKEN') || '';
  }

  private get adAccountId(): string {
    return this.dbAdAccountId || this.configService.get<string>('META_AD_ACCOUNT_ID') || '';
  }

  get isConfigured(): boolean {
    return !!(this.accessToken && this.adAccountId);
  }

  /**
   * Get date string in YYYY-MM-DD format
   */
  private getDate(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Fetch campaign insights from Meta Ads API
   */
  async getCampaignInsights(days: number = 7): Promise<CampaignInsight[]> {
    await this.refreshCredentials();
    
    if (!this.isConfigured) {
      this.logger.warn('Meta Ads API not configured - returning empty data');
      return [];
    }

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.adAccountId}/insights`;

      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          level: 'campaign',
          fields: [
            'campaign_id',
            'campaign_name',
            'spend',
            'impressions',
            'clicks',
            'cpc',
            'cpm',
            'ctr',
          ].join(','),
          time_range: JSON.stringify({
            since: this.getDate(days),
            until: this.getDate(0),
          }),
        },
      });

      const data = response.data.data || [];
      
      return data.map((item: any) => ({
        campaign_id: item.campaign_id,
        campaign_name: item.campaign_name,
        spend: parseFloat(item.spend || '0'),
        impressions: parseInt(item.impressions || '0', 10),
        clicks: parseInt(item.clicks || '0', 10),
        cpc: parseFloat(item.cpc || '0'),
        cpm: parseFloat(item.cpm || '0'),
        ctr: parseFloat(item.ctr || '0'),
        date_start: item.date_start,
        date_stop: item.date_stop,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch Meta Ads insights:', error.message);
      return [];
    }
  }

  /**
   * Get all ad sets for the account
   */
  async getAdSets(): Promise<AdSetInfo[]> {
    if (!this.isConfigured) {
      return [];
    }

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.adAccountId}/adsets`;

      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          fields: 'id,name,campaign_id,daily_budget,status',
        },
      });

      const data = response.data.data || [];
      
      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        campaign_id: item.campaign_id,
        daily_budget: parseInt(item.daily_budget || '0', 10) / 100, // Meta returns in cents
        status: item.status,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch ad sets:', error.message);
      return [];
    }
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('Meta Ads API not configured');
      return false;
    }

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${campaignId}`;

      await axios.post(url, null, {
        params: {
          access_token: this.accessToken,
          status: 'PAUSED',
        },
      });

      this.logger.log(`Campaign ${campaignId} paused successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to pause campaign ${campaignId}:`, error.message);
      return false;
    }
  }

  /**
   * Resume a campaign
   */
  async resumeCampaign(campaignId: string): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${campaignId}`;

      await axios.post(url, null, {
        params: {
          access_token: this.accessToken,
          status: 'ACTIVE',
        },
      });

      this.logger.log(`Campaign ${campaignId} resumed successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to resume campaign ${campaignId}:`, error.message);
      return false;
    }
  }

  /**
   * Update ad set budget (scale up or down)
   */
  async updateBudget(adSetId: string, newBudget: number): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${adSetId}`;

      // Meta expects budget in cents
      const budgetInCents = Math.round(newBudget * 100);

      await axios.post(url, null, {
        params: {
          access_token: this.accessToken,
          daily_budget: budgetInCents,
        },
      });

      this.logger.log(`Ad set ${adSetId} budget updated to $${newBudget}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to update budget for ad set ${adSetId}:`, error.message);
      return false;
    }
  }

  /**
   * Increase budget by percentage
   */
  async increaseBudget(adSetId: string, currentBudget: number, percentage: number = 20): Promise<boolean> {
    const newBudget = Math.round(currentBudget * (1 + percentage / 100));
    return this.updateBudget(adSetId, newBudget);
  }

  /**
   * Decrease budget by percentage
   */
  async decreaseBudget(adSetId: string, currentBudget: number, percentage: number = 20): Promise<boolean> {
    const newBudget = Math.round(currentBudget * (1 - percentage / 100));
    return this.updateBudget(adSetId, newBudget);
  }
}
