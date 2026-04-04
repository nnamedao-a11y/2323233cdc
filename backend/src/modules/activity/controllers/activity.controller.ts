import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../shared/enums';
import { ActivityService } from '../services/activity.service';
import { ActivityAggregatorService } from '../services/activity-aggregator.service';
import { QueryActivityDto } from '../dto/query-activity.dto';
import { ActivityEntityType } from '../enums/activity-action.enum';

@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly aggregatorService: ActivityAggregatorService,
  ) {}

  // Список активностей з фільтрами
  @Get()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async findAll(@Query() query: QueryActivityDto) {
    return this.activityService.findAll(query);
  }

  // Останні активності
  @Get('recent')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.TEAM_LEAD)
  async getRecent(@Query('limit') limit?: number) {
    return this.activityService.getRecentActivity(limit || 20);
  }

  // Моя активність
  @Get('my')
  async getMyActivity(@Request() req, @Query('limit') limit?: number) {
    return this.activityService.getUserActivity(req.user.id, limit || 50);
  }

  // Активність конкретного користувача
  @Get('user/:userId')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getUserActivity(@Request() req, @Query('limit') limit?: number) {
    return this.activityService.getUserActivity(req.params.userId, limit || 50);
  }

  // Активність по сутності (lead, deal, etc)
  @Get('entity/:entityType/:entityId')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.TEAM_LEAD, UserRole.MANAGER)
  async getEntityActivity(
    @Request() req,
    @Query('limit') limit?: number,
  ) {
    const { entityType, entityId } = req.params;
    return this.activityService.getEntityActivity(
      entityType as ActivityEntityType,
      entityId,
      limit || 50,
    );
  }

  // Performance статистика по менеджерах
  @Get('performance')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getAllPerformance(@Query('period') period?: 'day' | 'week' | 'month') {
    return this.aggregatorService.getAllManagersPerformance(period || 'day');
  }

  // Performance конкретного користувача
  @Get('performance/:userId')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getUserPerformance(
    @Request() req,
    @Query('period') period?: 'day' | 'week' | 'month',
  ) {
    return this.aggregatorService.getUserPerformance(req.params.userId, period || 'day');
  }

  // Моя performance
  @Get('my-performance')
  async getMyPerformance(
    @Request() req,
    @Query('period') period?: 'day' | 'week' | 'month',
  ) {
    return this.aggregatorService.getUserPerformance(req.user.id, period || 'day');
  }

  // Неактивні менеджери
  @Get('inactive-managers')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getInactiveManagers(@Query('hours') hours?: number) {
    return this.aggregatorService.getInactiveManagers(hours || 2);
  }

  // Кількість активностей за типами
  @Get('action-counts')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getActionCounts(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.aggregatorService.getActionCounts(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // SLA breaches
  @Get('sla-breaches')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getSlaBreaches(@Query('startDate') startDate?: string) {
    const count = await this.aggregatorService.getSlaBreachCount(
      startDate ? new Date(startDate) : undefined,
    );
    return { count };
  }
}
