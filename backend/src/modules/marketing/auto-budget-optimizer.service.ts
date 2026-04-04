import { Injectable, Logger } from '@nestjs/common';

/**
 * Campaign Status
 */
export type CampaignStatus = 'scale' | 'keep' | 'watch' | 'kill';

/**
 * Campaign Metrics
 */
export interface CampaignMetrics {
  source: string;
  campaign: string;
  adSet?: string;
  adId?: string;
  spend: number;
  visits: number;
  leads: number;
  deals: number;
  revenue: number;
  profit: number;
  fakeTrafficRate: number;
  vinSearches?: number;
  quotes?: number;
}

/**
 * Campaign Decision
 */
export interface CampaignDecision extends CampaignMetrics {
  status: CampaignStatus;
  roi: number;
  cpl: number; // Cost per lead
  cpa: number; // Cost per acquisition
  vinRate: number;
  quoteRate: number;
  reasons: string[];
  actions: string[];
}

/**
 * Auto Budget Optimizer Service
 * 
 * Rule-based marketing autopilot that evaluates campaigns
 * and provides actionable recommendations
 */
@Injectable()
export class AutoBudgetOptimizerService {
  private readonly logger = new Logger(AutoBudgetOptimizerService.name);

  /**
   * Evaluate campaign performance and provide decision
   */
  evaluate(metrics: CampaignMetrics): CampaignDecision {
    const reasons: string[] = [];
    const actions: string[] = [];

    // Calculate derived metrics
    const roi = metrics.spend > 0
      ? ((metrics.profit - metrics.spend) / metrics.spend) * 100
      : 0;

    const cpl = metrics.leads > 0 ? metrics.spend / metrics.leads : 0;
    const cpa = metrics.deals > 0 ? metrics.spend / metrics.deals : 0;

    const vinRate = metrics.visits > 0
      ? ((metrics.vinSearches || 0) / metrics.visits) * 100
      : 0;

    const quoteRate = metrics.visits > 0
      ? ((metrics.quotes || 0) / metrics.visits) * 100
      : 0;

    // Determine status based on rules
    let status: CampaignStatus = 'watch';

    // SCALE: Strong performance
    if (roi > 30 && metrics.deals >= 3 && metrics.fakeTrafficRate < 10) {
      status = 'scale';
      reasons.push('Strong ROI (>30%)');
      reasons.push(`${metrics.deals} deals confirmed`);
      reasons.push('Clean traffic (<10% fake)');
      actions.push('Increase budget by 15-20%');
      actions.push('Consider duplicating to new audiences');
    }
    // KEEP: Positive but not scaling
    else if (roi >= 10 && metrics.leads >= 5 && metrics.fakeTrafficRate < 20) {
      status = 'keep';
      reasons.push('Positive ROI (10-30%)');
      reasons.push('Stable lead flow');
      actions.push('Monitor for 3-5 more days');
      actions.push('Consider creative refresh');
    }
    // KILL: Burning money
    else if (
      metrics.spend > 100 &&
      metrics.deals === 0 &&
      (metrics.leads <= 1 || metrics.fakeTrafficRate > 30)
    ) {
      status = 'kill';
      reasons.push('No deals with significant spend');
      if (metrics.leads <= 1) reasons.push('Almost no leads');
      if (metrics.fakeTrafficRate > 30) reasons.push('High fake traffic (>30%)');
      actions.push('Pause campaign immediately');
      actions.push('Review targeting and creatives');
    }
    // WATCH: Needs more data or optimization
    else {
      status = 'watch';
      if (metrics.spend < 50) {
        reasons.push('Insufficient spend for evaluation');
        actions.push('Let it run to $100+ spend');
      } else {
        reasons.push('Mixed signals - needs optimization');
        if (vinRate < 5) actions.push('Improve VIN search intent');
        if (quoteRate < 2) actions.push('Optimize landing page');
      }
    }

    // Additional insights
    if (vinRate < 5 && metrics.visits > 100) {
      reasons.push('Weak VIN search intent (<5%)');
    }
    if (quoteRate < 2 && metrics.visits > 100) {
      reasons.push('Weak quote conversion (<2%)');
    }
    if (cpl > 50 && metrics.leads > 0) {
      reasons.push(`High CPL ($${this.round2(cpl)})`);
    }
    if (metrics.fakeTrafficRate > 20) {
      reasons.push(`Suspicious traffic (${this.round2(metrics.fakeTrafficRate)}%)`);
      actions.push('Check traffic quality');
    }

    return {
      ...metrics,
      status,
      roi: this.round2(roi),
      cpl: this.round2(cpl),
      cpa: this.round2(cpa),
      vinRate: this.round2(vinRate),
      quoteRate: this.round2(quoteRate),
      reasons,
      actions,
    };
  }

  /**
   * Evaluate multiple campaigns
   */
  evaluateAll(campaigns: CampaignMetrics[]): CampaignDecision[] {
    return campaigns
      .map(c => this.evaluate(c))
      .sort((a, b) => {
        // Sort by status priority: scale > keep > watch > kill
        const priority: Record<CampaignStatus, number> = {
          scale: 0,
          keep: 1,
          watch: 2,
          kill: 3,
        };
        return priority[a.status] - priority[b.status];
      });
  }

  /**
   * Get summary statistics
   */
  getSummary(decisions: CampaignDecision[]): {
    totalSpend: number;
    totalRevenue: number;
    totalProfit: number;
    overallRoi: number;
    scaleCount: number;
    keepCount: number;
    watchCount: number;
    killCount: number;
    recommendations: string[];
  } {
    const totalSpend = decisions.reduce((sum, d) => sum + d.spend, 0);
    const totalRevenue = decisions.reduce((sum, d) => sum + d.revenue, 0);
    const totalProfit = decisions.reduce((sum, d) => sum + d.profit, 0);
    const overallRoi = totalSpend > 0 ? ((totalProfit - totalSpend) / totalSpend) * 100 : 0;

    const scaleCount = decisions.filter(d => d.status === 'scale').length;
    const keepCount = decisions.filter(d => d.status === 'keep').length;
    const watchCount = decisions.filter(d => d.status === 'watch').length;
    const killCount = decisions.filter(d => d.status === 'kill').length;

    const recommendations: string[] = [];
    
    if (killCount > 0) {
      const killSpend = decisions.filter(d => d.status === 'kill').reduce((s, d) => s + d.spend, 0);
      recommendations.push(`Stop wasting $${killSpend.toFixed(0)} on ${killCount} failing campaigns`);
    }
    
    if (scaleCount > 0) {
      recommendations.push(`Scale ${scaleCount} high-performing campaigns by 15-20%`);
    }

    if (overallRoi < 0) {
      recommendations.push('Overall ROI is negative - immediate optimization needed');
    } else if (overallRoi > 50) {
      recommendations.push('Strong overall ROI - consider increasing total budget');
    }

    return {
      totalSpend: this.round2(totalSpend),
      totalRevenue: this.round2(totalRevenue),
      totalProfit: this.round2(totalProfit),
      overallRoi: this.round2(overallRoi),
      scaleCount,
      keepCount,
      watchCount,
      killCount,
      recommendations,
    };
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
