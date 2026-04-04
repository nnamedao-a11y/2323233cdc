import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../leads/lead.schema';
import { PredictiveScoreService, LeadScore, LeadSignals } from './services/predictive-score.service';
import { PredictiveActionService, ActionRecommendation } from './services/predictive-action.service';

export interface PredictiveLead {
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    vin?: string;
  };
  score: LeadScore;
  action: ActionRecommendation;
  signals: LeadSignals;
}

@Injectable()
export class PredictiveLeadService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    private scoreService: PredictiveScoreService,
    private actionService: PredictiveActionService,
  ) {}

  async evaluateLead(leadId: string): Promise<PredictiveLead | null> {
    const lead = await this.leadModel.findOne({ id: leadId, isDeleted: false });
    if (!lead) return null;

    const signals = this.extractSignals(lead);
    const score = this.scoreService.calculate(signals);
    const action = this.actionService.getAction(score, signals);

    return {
      lead: {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        email: lead.email,
        vin: lead.vin,
      },
      score,
      action,
      signals,
    };
  }

  async evaluateLeadBySignals(signals: LeadSignals): Promise<{ score: LeadScore; action: ActionRecommendation }> {
    const score = this.scoreService.calculate(signals);
    const action = this.actionService.getAction(score, signals);
    return { score, action };
  }

  async getTopLeads(managerId: string, limit: number = 20): Promise<PredictiveLead[]> {
    const leads = await this.leadModel.find({
      assignedTo: managerId,
      status: { $nin: ['won', 'lost', 'archived'] },
      isDeleted: false,
    }).limit(100);

    const evaluatedLeads = await Promise.all(
      leads.map(lead => this.evaluateLead(lead.id))
    );

    // Filter nulls and sort by score
    return evaluatedLeads
      .filter((l): l is PredictiveLead => l !== null)
      .sort((a, b) => b.score.totalScore - a.score.totalScore)
      .slice(0, limit);
  }

  async getHotLeads(managerId?: string, limit: number = 20): Promise<PredictiveLead[]> {
    const filter: any = {
      status: { $nin: ['won', 'lost', 'archived'] },
      isDeleted: false,
    };
    
    if (managerId) {
      filter.assignedTo = managerId;
    }

    // Get leads with high intent or recent activity
    const leads = await this.leadModel.find({
      ...filter,
      $or: [
        { intentScore: { $gte: 8 } },
        { intentLevel: 'hot' },
        { 'intentContext.favoriteVins': { $exists: true, $ne: [] } },
        { 'intentContext.compareVins': { $exists: true, $ne: [] } },
      ],
    }).limit(100);

    const evaluatedLeads = await Promise.all(
      leads.map(lead => this.evaluateLead(lead.id))
    );

    return evaluatedLeads
      .filter((l): l is PredictiveLead => l !== null && l.score.bucket === 'hot')
      .sort((a, b) => b.score.totalScore - a.score.totalScore)
      .slice(0, limit);
  }

  async getLeadsNeedingAction(managerId: string): Promise<PredictiveLead[]> {
    const topLeads = await this.getTopLeads(managerId, 50);
    
    // Filter to only leads with high priority actions
    return topLeads.filter(l => l.action.priority <= 2);
  }

  async getLeadsByBucket(managerId: string, bucket: 'hot' | 'warm' | 'cold'): Promise<PredictiveLead[]> {
    const topLeads = await this.getTopLeads(managerId, 100);
    return topLeads.filter(l => l.score.bucket === bucket);
  }

  private extractSignals(lead: Lead): LeadSignals {
    const now = new Date();
    const createdAt = new Date((lead as any).createdAt || now);
    const lastActivity = lead.lastContactAt ? new Date(lead.lastContactAt) : createdAt;

    return {
      // Behavior from intent context
      favorites: lead.intentContext?.favoriteVins?.length || 0,
      compare: lead.intentContext?.compareVins?.length || 0,
      historyRequests: 0, // TODO: track this
      vinChecks: lead.vin ? 1 : 0,
      
      // Sales signals
      wasContacted: lead.contactStatus !== 'new_request',
      requestedCallback: lead.contactStatus === 'callback_scheduled',
      negotiation: lead.status === 'negotiation',
      noAnswerAttempts: lead.callAttempts || 0,
      callAttempts: lead.callAttempts || 0,
      
      // Intent
      intentScore: lead.intentScore,
      intentLevel: lead.intentLevel,
      
      // Freshness
      createdHoursAgo: (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60),
      lastActivityHours: (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60),
    };
  }
}
