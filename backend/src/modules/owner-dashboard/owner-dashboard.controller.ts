/**
 * BIBI Cars - Owner Dashboard Controller
 * API endpoint for owner analytics
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OwnerDashboardService } from './owner-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('owner-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class OwnerDashboardController {
  constructor(private readonly ownerDashboardService: OwnerDashboardService) {}

  @Get()
  async getDashboard(@Query('days') days?: string) {
    return this.ownerDashboardService.getDashboard(parseInt(days || '30'));
  }
}
