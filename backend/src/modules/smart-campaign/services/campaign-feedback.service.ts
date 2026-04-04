/**
 * Campaign Feedback Service
 * 
 * Learning Revenue System - збір та аналіз результатів кампаній
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CampaignFeedback, CampaignFeedbackDocument } from '../schemas/campaign-feedback.schema';
import { SmartCampaignLog, SmartCampaignLogDocument } from '../schemas/smart-campaign-log.schema';

export interface CampaignPattern {
  trigger: string;
  channel: string;
  intentLevel: string;
  conversionRate: number;
  avgResponseTime: number;
  sampleSize: number;
}

@Injectable()
export class CampaignFeedbackService {
  private readonly logger = new Logger(CampaignFeedbackService.name);

  constructor(
    @InjectModel(CampaignFeedback.name)
    private readonly feedbackModel: Model<CampaignFeedbackDocument>,
    @InjectModel(SmartCampaignLog.name)
    private readonly logModel: Model<SmartCampaignLogDocument>,
  ) {}

  /**
   * Записати feedback для кампанії
   */
  async recordFeedback(data: {
    campaignLogId: string;
    userId: string;
    vin?: string;
    event: 'opened' | 'clicked' | 'replied' | 'became_hot' | 'became_lead' | 'became_deal' | 'became_deposit';
    value?: number;
  }) {
    const log = await this.logModel.findById(data.campaignLogId);
    if (!log) return;

    let feedback = await this.feedbackModel.findOne({ campaignLogId: data.campaignLogId });
    
    if (!feedback) {
      feedback = new this.feedbackModel({
        campaignLogId: data.campaignLogId,
        userId: data.userId,
        vin: data.vin,
        channel: log.channel,
        messageType: log.trigger,
        intentScoreBefore: log.userContext?.intentScore,
      });
    }

    const now = new Date();
    const sentAt = log.sentAt || new Date();

    switch (data.event) {
      case 'opened':
        feedback.opened = true;
        break;
      case 'clicked':
        feedback.clicked = true;
        break;
      case 'replied':
        feedback.replied = true;
        feedback.responseTimeMinutes = Math.round((now.getTime() - sentAt.getTime()) / 60000);
        break;
      case 'became_hot':
        feedback.becameHot = true;
        break;
      case 'became_lead':
        feedback.becameLead = true;
        feedback.conversionTimeHours = Math.round((now.getTime() - sentAt.getTime()) / (60 * 60 * 1000));
        break;
      case 'became_deal':
        feedback.becameDeal = true;
        if (data.value) feedback.dealValue = data.value;
        break;
      case 'became_deposit':
        feedback.becameDeposit = true;
        if (data.value) feedback.depositValue = data.value;
        break;
    }

    await feedback.save();
    this.logger.log(`[Feedback] Recorded ${data.event} for campaign ${data.campaignLogId}`);
  }

  /**
   * Отримати патерни успішних кампаній
   */
  async getSuccessPatterns(): Promise<CampaignPattern[]> {
    const patterns = await this.feedbackModel.aggregate([
      {
        $lookup: {
          from: 'smartcampaignlogs',
          localField: 'campaignLogId',
          foreignField: '_id',
          as: 'log',
        },
      },
      { $unwind: '$log' },
      {
        $group: {
          _id: {
            trigger: '$log.trigger',
            channel: '$channel',
            intentLevel: '$log.userContext.intentLevel',
          },
          total: { $sum: 1 },
          leads: { $sum: { $cond: ['$becameLead', 1, 0] } },
          deals: { $sum: { $cond: ['$becameDeal', 1, 0] } },
          replied: { $sum: { $cond: ['$replied', 1, 0] } },
          avgResponseTime: { $avg: '$responseTimeMinutes' },
          totalRevenue: { $sum: '$dealValue' },
        },
      },
      { $match: { total: { $gte: 5 } } }, // Мінімум 5 samples
      { $sort: { 'leads': -1 } },
    ]);

    return patterns.map(p => ({
      trigger: p._id.trigger,
      channel: p._id.channel,
      intentLevel: p._id.intentLevel,
      conversionRate: p.total > 0 ? (p.leads / p.total) * 100 : 0,
      avgResponseTime: p.avgResponseTime || 0,
      sampleSize: p.total,
    }));
  }

  /**
   * Отримати рекомендацію для тригера/каналу
   */
  async getBestChannelForTrigger(trigger: string, intentLevel: string): Promise<string> {
    const patterns = await this.feedbackModel.aggregate([
      {
        $lookup: {
          from: 'smartcampaignlogs',
          localField: 'campaignLogId',
          foreignField: '_id',
          as: 'log',
        },
      },
      { $unwind: '$log' },
      {
        $match: {
          'log.trigger': trigger,
          'log.userContext.intentLevel': intentLevel,
        },
      },
      {
        $group: {
          _id: '$channel',
          total: { $sum: 1 },
          conversions: { $sum: { $cond: ['$becameLead', 1, 0] } },
        },
      },
      { $sort: { conversions: -1 } },
      { $limit: 1 },
    ]);

    return patterns[0]?._id || 'sms';
  }

  /**
   * Загальна статистика
   */
  async getOverallStats() {
    const [total, withFeedback, conversions, revenue] = await Promise.all([
      this.logModel.countDocuments({ status: 'sent' }),
      this.feedbackModel.countDocuments(),
      this.feedbackModel.countDocuments({ becameLead: true }),
      this.feedbackModel.aggregate([
        { $group: { _id: null, total: { $sum: '$dealValue' } } },
      ]),
    ]);

    return {
      totalCampaigns: total,
      withFeedback,
      conversions,
      conversionRate: withFeedback > 0 ? ((conversions / withFeedback) * 100).toFixed(1) : 0,
      totalRevenue: revenue[0]?.total || 0,
    };
  }

  /**
   * Ефективність по каналах
   */
  async getChannelEffectiveness() {
    return this.feedbackModel.aggregate([
      {
        $group: {
          _id: '$channel',
          total: { $sum: 1 },
          opened: { $sum: { $cond: ['$opened', 1, 0] } },
          replied: { $sum: { $cond: ['$replied', 1, 0] } },
          leads: { $sum: { $cond: ['$becameLead', 1, 0] } },
          deals: { $sum: { $cond: ['$becameDeal', 1, 0] } },
          revenue: { $sum: '$dealValue' },
        },
      },
      {
        $project: {
          channel: '$_id',
          total: 1,
          openRate: { $multiply: [{ $divide: ['$opened', '$total'] }, 100] },
          replyRate: { $multiply: [{ $divide: ['$replied', '$total'] }, 100] },
          conversionRate: { $multiply: [{ $divide: ['$leads', '$total'] }, 100] },
          dealRate: { $multiply: [{ $divide: ['$deals', '$total'] }, 100] },
          revenue: 1,
        },
      },
    ]);
  }
}
