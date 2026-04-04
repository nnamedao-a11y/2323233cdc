import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';
import { ActivityAggregatorService } from '../activity/services/activity-aggregator.service';

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
  constructor(
    private readonly usersService: UsersService,
    private readonly activityAggregator: ActivityAggregatorService,
  ) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.TEAM_LEAD)
  async findAll(@Query() query: any) {
    return this.usersService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getStats() {
    return this.usersService.countByRole();
  }

  // Список менеджерів з performance
  @Get('performance')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getPerformance(@Query('period') period?: 'day' | 'week' | 'month') {
    return this.activityAggregator.getAllManagersPerformance(period || 'day');
  }

  // Performance конкретного менеджера
  @Get('performance/:id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getManagerPerformance(
    @Param('id') id: string,
    @Query('period') period?: 'day' | 'week' | 'month',
  ) {
    return this.activityAggregator.getUserPerformance(id, period || 'day');
  }

  // Неактивні менеджери
  @Get('inactive')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getInactive(@Query('hours') hours?: number) {
    return this.activityAggregator.getInactiveManagers(hours || 2);
  }

  // Створити нового співробітника
  @Post()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async create(@Body() body: any) {
    return this.usersService.create(body);
  }

  // Оновити співробітника
  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  // Активувати/деактивувати
  @Put(':id/toggle-active')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async toggleActive(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new BadRequestException('User not found');
    return this.usersService.update(id, { isActive: !user.isActive });
  }

  // Скинути пароль
  @Post(':id/reset-password')
  @Roles(UserRole.OWNER)
  async resetPassword(@Param('id') id: string, @Body('newPassword') newPassword: string) {
    return this.usersService.changePassword(id, newPassword);
  }
}
