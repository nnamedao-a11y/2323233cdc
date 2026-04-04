import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('automation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('rules')
  async createRule(@Body() data: any) {
    return this.automationService.createRule(data);
  }

  @Get('rules')
  async findAllRules() {
    return this.automationService.findAllRules();
  }

  @Put('rules/:id')
  async updateRule(@Param('id') id: string, @Body() data: any) {
    return this.automationService.updateRule(id, data);
  }

  @Delete('rules/:id')
  async deleteRule(@Param('id') id: string) {
    return this.automationService.deleteRule(id);
  }

  @Get('logs')
  async findLogs(@Query() query: { ruleId?: string; entityType?: string; entityId?: string; limit?: number }) {
    return this.automationService.findLogs(query);
  }
}
