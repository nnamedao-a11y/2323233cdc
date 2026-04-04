/**
 * Auto Action Service
 * 
 * Executes marketing automation actions (pause/scale/decrease)
 * with safety limits and logging
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetaAdsService, AdSetInfo } from './meta-ads.service';
import { MarketingPerformanceService } from './marketing-performance.service';
import { AutoAction, AutoActionDocument, ActionType, ActionStatus } from './auto-action.schema';
import { CampaignSpend, CampaignSpendDocument } from './campaign-spend.schema';

export interface AutoModeConfig {
  enabled: boolean;
  maxActionsPerDay: number;
  maxBudgetChangePercent: number;
  minSpendForDecision: number;
  minDataDays: number;
}

export interface ActionDecision {
  campaign: string;
  status: 'scale' | 'kill' | 'watch' | 'keep';
  roi?: number;
  profit?: number;
  spend?: number;
  actions?: string[];
  reasons?: string[];
}

export interface DecisionLogEntry {
  campaign: string;
  roi: number | null;
  spend: number;
  profit: number;
  decision: string;
  reasons: string[];
  timestamp: Date;
}

@Injectable()
export class AutoActionService {
  private readonly logger = new Logger(AutoActionService.name);
  
  // Decision log for transparency (why system made each decision)
  private decisionLog: DecisionLogEntry[] = [];
  private readonly MAX_LOG_SIZE = 1000;
  
  // Default configuration - can be overridden via settings
  private config: AutoModeConfig = {
    enabled: false,
    maxActionsPerDay: 5,
    maxBudgetChangePercent: 20,
    minSpendForDecision: 50,
    minDataDays: 3,
  };

  // Cache ad sets
  private adSetsCache: AdSetInfo[] = [];
  private adSetsCacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectModel(AutoAction.name) private autoActionModel: Model<AutoActionDocument>,
    @InjectModel(CampaignSpend.name) private spendModel: Model<CampaignSpendDocument>,
    private metaAdsService: MetaAdsService,
    private performanceService: MarketingPerformanceService,
  ) {}

  /**
   * Log a decision for transparency
   */
  logDecision(decision: ActionDecision): void {
    const entry: DecisionLogEntry = {
      campaign: decision.campaign,
      roi: decision.roi ?? null,
      spend: decision.spend || 0,
      profit: decision.profit || 0,
      decision: decision.status,
      reasons: decision.reasons || [],
      timestamp: new Date(),
    };
    
    this.decisionLog.unshift(entry);
    
    // Keep log size manageable
    if (this.decisionLog.length > this.MAX_LOG_SIZE) {
      this.decisionLog = this.decisionLog.slice(0, this.MAX_LOG_SIZE);
    }
    
    this.logger.log(`Decision logged: ${decision.campaign} → ${decision.status} (ROI: ${decision.roi ?? 'N/A'}%)`);
  }

  /**
   * Get decision log
   */
  getDecisionLog(limit: number = 100): DecisionLogEntry[] {
    return this.decisionLog.slice(0, limit);
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoModeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoModeConfig>): AutoModeConfig {
    this.config = { ...this.config, ...config };
    this.logger.log(`Auto mode config updated: ${JSON.stringify(this.config)}`);
    return this.config;
  }

  /**
   * Sync campaign spend data from Meta Ads
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncSpendData(): Promise<void> {
    if (!this.metaAdsService.isConfigured) {
      return;
    }

    this.logger.log('Syncing campaign spend data from Meta Ads...');

    try {
      const insights = await this.metaAdsService.getCampaignInsights(7);

      for (const insight of insights) {
        await this.spendModel.updateOne(
          { campaignId: insight.campaign_id },
          {
            campaign: insight.campaign_name,
            campaignId: insight.campaign_id,
            spend: insight.spend,
            clicks: insight.clicks,
            impressions: insight.impressions,
            cpc: insight.cpc,
            cpm: insight.cpm,
            ctr: insight.ctr,
            dateStart: insight.date_start,
            dateStop: insight.date_stop,
            syncedAt: new Date(),
          },
          { upsert: true },
        );
      }

      this.logger.log(`Synced ${insights.length} campaign spend records`);
    } catch (error) {
      this.logger.error('Failed to sync spend data:', error.message);
    }
  }

  /**
   * Get spend data for all campaigns
   */
  async getSpendData(): Promise<CampaignSpendDocument[]> {
    return this.spendModel.find().sort({ spend: -1 }).exec();
  }

  /**
   * Get spend for a specific campaign
   */
  async getCampaignSpend(campaign: string): Promise<number> {
    const record = await this.spendModel.findOne({ campaign }).exec();
    return record?.spend || 0;
  }

  /**
   * Get ad sets with caching
   */
  private async getAdSets(): Promise<AdSetInfo[]> {
    const now = Date.now();
    
    if (this.adSetsCache.length > 0 && (now - this.adSetsCacheTime) < this.CACHE_TTL) {
      return this.adSetsCache;
    }

    this.adSetsCache = await this.metaAdsService.getAdSets();
    this.adSetsCacheTime = now;
    
    return this.adSetsCache;
  }

  /**
   * Get ad set for a campaign
   */
  private async getAdSetForCampaign(campaignId: string): Promise<AdSetInfo | null> {
    const adSets = await this.getAdSets();
    return adSets.find(a => a.campaign_id === campaignId) || null;
  }

  /**
   * Check safety limits before executing action
   */
  private async checkSafetyLimits(): Promise<{ allowed: boolean; reason?: string }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayActions = await this.autoActionModel.countDocuments({
      createdAt: { $gte: today },
      status: ActionStatus.EXECUTED,
    });

    if (todayActions >= this.config.maxActionsPerDay) {
      return { allowed: false, reason: `Daily action limit reached (${this.config.maxActionsPerDay})` };
    }

    return { allowed: true };
  }

  /**
   * Execute a single action
   */
  async executeAction(
    decision: ActionDecision,
    isAuto: boolean = false,
  ): Promise<{ success: boolean; action?: AutoActionDocument }> {
    // Safety check
    const safetyCheck = await this.checkSafetyLimits();
    if (!safetyCheck.allowed) {
      this.logger.warn(`Action blocked: ${safetyCheck.reason}`);
      return { success: false };
    }

    // Get spend data
    const spendRecord = await this.spendModel.findOne({ campaign: decision.campaign }).exec();
    const spend = spendRecord?.spend || decision.spend || 0;

    // Check minimum spend
    if (spend < this.config.minSpendForDecision && decision.status !== 'keep') {
      this.logger.warn(`Skipping action for ${decision.campaign}: insufficient spend ($${spend})`);
      return { success: false };
    }

    // Determine action type
    let actionType: ActionType;
    switch (decision.status) {
      case 'kill':
        actionType = ActionType.PAUSE;
        break;
      case 'scale':
        actionType = ActionType.SCALE_UP;
        break;
      case 'watch':
        actionType = ActionType.SCALE_DOWN;
        break;
      default:
        return { success: false };
    }

    // Create action record
    const action = new this.autoActionModel({
      campaign: decision.campaign,
      campaignId: spendRecord?.campaignId || '',
      actionType,
      reason: decision.actions?.join('; ') || decision.reasons?.join('; ') || '',
      roi: decision.roi || 0,
      spend,
      profit: decision.profit || 0,
      isAuto,
    });

    try {
      let success = false;

      if (actionType === ActionType.PAUSE) {
        // Pause campaign
        if (spendRecord?.campaignId) {
          success = await this.metaAdsService.pauseCampaign(spendRecord.campaignId);
        }
      } else {
        // Scale budget
        const adSet = await this.getAdSetForCampaign(spendRecord?.campaignId || '');
        
        if (adSet) {
          action.adSetId = adSet.id;
          action.oldValue = adSet.daily_budget;

          if (actionType === ActionType.SCALE_UP) {
            const newBudget = Math.round(adSet.daily_budget * (1 + this.config.maxBudgetChangePercent / 100));
            action.newValue = newBudget;
            success = await this.metaAdsService.updateBudget(adSet.id, newBudget);
          } else {
            const newBudget = Math.round(adSet.daily_budget * (1 - this.config.maxBudgetChangePercent / 100));
            action.newValue = newBudget;
            success = await this.metaAdsService.updateBudget(adSet.id, newBudget);
          }
        }
      }

      if (success) {
        action.status = ActionStatus.EXECUTED;
        action.executedAt = new Date();
      } else {
        action.status = ActionStatus.FAILED;
        action.error = 'API call failed or no campaign ID';
      }

      await action.save();
      this.logger.log(`Action ${actionType} for ${decision.campaign}: ${action.status}`);
      
      return { success, action };
    } catch (error) {
      action.status = ActionStatus.FAILED;
      action.error = error.message;
      await action.save();
      
      this.logger.error(`Action failed for ${decision.campaign}:`, error.message);
      return { success: false, action };
    }
  }

  /**
   * Run auto optimization (called by cron)
   */
  @Cron('0 */30 * * * *') // Every 30 minutes
  async runAutoOptimization(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (!this.metaAdsService.isConfigured) {
      return;
    }

    this.logger.log('Running auto optimization...');

    try {
      // Get campaign performance data
      const result = await this.performanceService.getCampaignPerformance(7);
      const { decisions } = result;

      // Filter actionable decisions
      const actionable = decisions.filter(d => 
        d.status === 'kill' || d.status === 'scale' || d.status === 'watch'
      );

      // Execute actions with safety limits
      for (const decision of actionable) {
        const safetyCheck = await this.checkSafetyLimits();
        if (!safetyCheck.allowed) {
          this.logger.warn('Daily limit reached, stopping auto optimization');
          break;
        }

        // Only auto-execute for extreme cases
        if (decision.status === 'kill' && decision.roi < -50) {
          await this.executeAction(decision, true);
        } else if (decision.status === 'scale' && decision.roi > 50) {
          await this.executeAction(decision, true);
        }
      }

      this.logger.log('Auto optimization completed');
    } catch (error) {
      this.logger.error('Auto optimization failed:', error.message);
    }
  }

  /**
   * Get action history
   */
  async getActionHistory(days: number = 30): Promise<AutoActionDocument[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.autoActionModel
      .find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  /**
   * Get today's action count
   */
  async getTodayActionCount(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.autoActionModel.countDocuments({
      createdAt: { $gte: today },
      status: ActionStatus.EXECUTED,
    });
  }
}
