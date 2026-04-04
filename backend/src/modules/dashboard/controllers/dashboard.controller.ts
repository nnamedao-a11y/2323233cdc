import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DashboardService } from '../services/dashboard.service';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { LeadsService } from '../../leads/leads.service';
import { CustomersService } from '../../customers/customers.service';
import { DealsService } from '../../deals/deals.service';
import { DepositsService } from '../../deposits/deposits.service';
import { TasksService } from '../../tasks/tasks.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly leadsService: LeadsService,
    private readonly customersService: CustomersService,
    private readonly dealsService: DealsService,
    private readonly depositsService: DepositsService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * GET /api/dashboard/master
   * Головний endpoint для Master Dashboard v2
   * Повертає всі метрики: SLA, Workload, Leads, Callbacks, Deposits, Documents, Routing, System
   */
  @Get('master')
  async getMasterDashboard(
    @Query() query: DashboardQueryDto,
    @Request() req,
  ) {
    return this.dashboardService.getMasterDashboard(query, req.user?.id);
  }

  /**
   * GET /api/dashboard/kpi
   * Короткий огляд критичних KPI
   */
  @Get('kpi-summary')
  async getKpiSummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getKpiSummary(query);
  }

  /**
   * GET /api/dashboard
   * Legacy endpoint - базова статистика для сумісності
   */
  @Get()
  async getDashboard(@Request() req) {
    const [leads, customers, deals, deposits, tasks] = await Promise.all([
      this.leadsService.getStats(),
      this.customersService.getStats(),
      this.dealsService.getStats(),
      this.depositsService.getStats(),
      this.tasksService.getStats(req.user.id),
    ]);

    return {
      leads,
      customers,
      deals,
      deposits,
      tasks,
    };
  }

  /**
   * GET /api/dashboard/kpi
   * Legacy KPI endpoint
   */
  @Get('kpi')
  async getKpi() {
    const [leads, deals, deposits] = await Promise.all([
      this.leadsService.getStats(),
      this.dealsService.getStats(),
      this.depositsService.getStats(),
    ]);

    const conversionRate =
      leads.total > 0
        ? Math.round(((leads.byStatus?.won || 0) / leads.total) * 100)
        : 0;

    return {
      totalLeads: leads.total,
      totalDeals: deals.total,
      totalDealsValue: deals.totalValue,
      totalDeposits: deposits.total,
      totalDepositsAmount: deposits.totalAmount,
      conversionRate,
    };
  }
}
