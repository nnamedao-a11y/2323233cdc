import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.schema';
import { KPIAggregatorService, ManagerStats } from './services/kpi-aggregator.service';
import { KPIAlertsService, KPIAlert } from './services/kpi-alerts.service';
import { KPIRatingService, ManagerRating } from './services/kpi-rating.service';
import { UserRole } from '../../shared/enums';
import { CACHE_SERVICE, CacheService } from '../../infrastructure/cache/cache.module';

export interface ManagerKPI {
  manager: {
    id: string;
    name: string;
    email: string;
  };
  stats: ManagerStats;
  alerts: KPIAlert[];
  rating: ManagerRating;
  needsAttention: boolean;
}

export interface TeamKPIDashboard {
  teamLeadId: string;
  teamSize: number;
  managers: ManagerKPI[];
  summary: {
    totalLeads: number;
    totalDeals: number;
    totalRevenue: number;
    avgConversion: number;
    criticalAlerts: number;
  };
  topPerformers: ManagerRating[];
  needsAttention: ManagerKPI[];
}

@Injectable()
export class KPIService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private aggregator: KPIAggregatorService,
    private alerts: KPIAlertsService,
    private rating: KPIRatingService,
    @Inject(CACHE_SERVICE) private cache: CacheService,
  ) {}

  // === TEAM SUMMARY (for Team Lead Panel) ===
  async getTeamSummary(periodDays: number = 7): Promise<any> {
    const cacheKey = `${CacheService.KEYS.KPI_TEAM}:summary:${periodDays}`;
    
    return this.cache.wrap(cacheKey, async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Get all managers
      const allManagers = await this.userModel.find({
        role: { $in: [UserRole.MANAGER, 'manager'] },
        isDeleted: false,
      });

      const activeManagers = allManagers.filter(m => m.isActive);

      // Use mock data for demo (real implementation would query leads/deals/calls collections)
      const leadsToday = Math.floor(Math.random() * 15) + 5;
      const leadsYesterday = Math.floor(Math.random() * 15) + 5;
      const activeDeals = Math.floor(Math.random() * 10) + 3;
      const completedDeals = Math.floor(Math.random() * 5) + 1;
      const callsToday = Math.floor(Math.random() * 30) + 10;
      const missedCalls = Math.floor(Math.random() * 5);

      // Calculate change percentage
      const leadsChange = leadsYesterday > 0 
        ? Math.round(((leadsToday - leadsYesterday) / leadsYesterday) * 100) 
        : 0;

      return {
        leadsToday,
        leadsChange: leadsChange >= 0 ? `+${leadsChange}%` : `${leadsChange}%`,
        activeDeals,
        completedDeals,
        callsToday,
        missedCalls,
        activeManagers: activeManagers.length,
        totalManagers: allManagers.length,
      };
    }, CacheService.TTL.MEDIUM);
  }

  async getManagerKPI(managerId: string, periodDays: number = 30): Promise<ManagerKPI> {
    const cacheKey = `${CacheService.KEYS.KPI_MANAGER}:${managerId}:${periodDays}`;
    
    return this.cache.wrap(cacheKey, async () => {
      const user = await this.userModel.findOne({ id: managerId });
      const stats = await this.aggregator.getManagerStats(managerId, periodDays);
      const alertsList = this.alerts.evaluate(stats);
      const ratingData = this.rating.calculate(stats);
      const needsAttention = this.alerts.needsAttention(stats);

      return {
        manager: {
          id: managerId,
          name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          email: user?.email || '',
        },
        stats,
        alerts: alertsList,
        rating: ratingData,
        needsAttention,
      };
    }, CacheService.TTL.MEDIUM);
  }

  async getTeamKPI(teamLeadId: string, periodDays: number = 30): Promise<TeamKPIDashboard> {
    const cacheKey = `${CacheService.KEYS.KPI_TEAM}:${teamLeadId}:${periodDays}`;
    
    return this.cache.wrap(cacheKey, async () => {
      // Get all managers under this team lead
      const managers = await this.userModel.find({
        teamLeadId,
        role: UserRole.MANAGER,
        isActive: true,
        isDeleted: false,
      });

      const managerIds = managers.map(m => m.id);
      
      // Get KPI for each manager (uses cache internally)
      const managersKPI = await Promise.all(
        managers.map(async (m) => {
          const kpi = await this.getManagerKPI(m.id, periodDays);
          kpi.manager.name = `${m.firstName} ${m.lastName}`;
          kpi.manager.email = m.email;
          return kpi;
        })
      );

      // Calculate summary
      const summary = {
        totalLeads: managersKPI.reduce((sum, m) => sum + m.stats.leads, 0),
        totalDeals: managersKPI.reduce((sum, m) => sum + m.stats.dealsWon, 0),
        totalRevenue: managersKPI.reduce((sum, m) => sum + m.stats.dealValue, 0),
        avgConversion: managersKPI.length > 0 
          ? managersKPI.reduce((sum, m) => sum + m.stats.conversionRate, 0) / managersKPI.length 
          : 0,
        criticalAlerts: managersKPI.reduce(
          (sum, m) => sum + m.alerts.filter(a => a.type === 'CRITICAL').length, 
          0
        ),
      };

      // Get top performers
      const allStats = managersKPI.map(m => m.stats);
      const topPerformers = this.rating.calculateTeamRatings(allStats).slice(0, 5);

      // Get managers who need attention
      const needsAttention = managersKPI.filter(m => m.needsAttention);

      return {
        teamLeadId,
        teamSize: managers.length,
        managers: managersKPI,
        summary,
        topPerformers,
        needsAttention,
      };
    }, CacheService.TTL.LONG);
  }

  async getOwnerDashboard(periodDays: number = 30): Promise<any> {
    const cacheKey = `${CacheService.KEYS.KPI_DASHBOARD}:owner:${periodDays}`;
    
    return this.cache.wrap(cacheKey, async () => {
      // Get all team leads
      const teamLeads = await this.userModel.find({
        role: UserRole.TEAM_LEAD,
        isActive: true,
        isDeleted: false,
      });

      // Get all managers
      const allManagers = await this.userModel.find({
        role: UserRole.MANAGER,
        isActive: true,
        isDeleted: false,
      });

      // Get KPI for all managers (uses cache internally)
      const allKPI = await Promise.all(
        allManagers.map(m => this.getManagerKPI(m.id, periodDays))
      );

      // Calculate totals
      const totals = {
        totalTeamLeads: teamLeads.length,
        totalManagers: allManagers.length,
        totalLeads: allKPI.reduce((sum, m) => sum + m.stats.leads, 0),
        totalDeals: allKPI.reduce((sum, m) => sum + m.stats.dealsWon, 0),
        totalRevenue: allKPI.reduce((sum, m) => sum + m.stats.dealValue, 0),
        criticalAlerts: allKPI.reduce(
          (sum, m) => sum + m.alerts.filter(a => a.type === 'CRITICAL').length, 
          0
        ),
      };

      // Get leaderboard
      const leaderboard = await this.aggregator.getLeaderboard(10, periodDays);

      // Get managers needing attention
      const needsAttention = allKPI
        .filter(m => m.needsAttention)
        .sort((a, b) => {
          const aCritical = a.alerts.filter(al => al.type === 'CRITICAL').length;
          const bCritical = b.alerts.filter(al => al.type === 'CRITICAL').length;
          return bCritical - aCritical;
        })
        .slice(0, 10);

      return {
        totals,
        leaderboard,
        needsAttention,
        teamLeads: teamLeads.map(t => ({
          id: t.id,
          name: `${t.firstName} ${t.lastName}`,
          email: t.email,
        })),
      };
    }, CacheService.TTL.LONG);
  }
}
