/**
 * BIBI Cars - Cadence Controller
 */

import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CadenceService } from './cadence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('cadence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CadenceController {
  constructor(private readonly cadenceService: CadenceService) {}

  @Get('definitions')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getCadences() {
    return this.cadenceService.getCadences();
  }

  @Get('runs')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getActiveRuns() {
    return this.cadenceService.getActiveRuns();
  }

  @Get('runs/:entityType/:entityId')
  async getEntityRuns(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string
  ) {
    return this.cadenceService.getActiveRuns(entityType, entityId);
  }

  @Get('runs/:runId/logs')
  async getRunLogs(@Param('runId') runId: string) {
    return this.cadenceService.getRunLogs(runId);
  }

  @Post('seed')
  @Roles(UserRole.OWNER)
  async seedCadences() {
    await this.cadenceService.seedCadences();
    return { success: true, message: 'Cadences seeded' };
  }
}
