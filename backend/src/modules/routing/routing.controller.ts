/**
 * BIBI Cars - Routing Controller
 * Admin endpoints for routing rules management
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('routing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  // ============ RULES MANAGEMENT ============

  @Get('rules')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getRules() {
    return this.routingService.getRules();
  }

  @Post('rules')
  @Roles(UserRole.OWNER)
  async createRule(@Body() data: any) {
    return this.routingService.createRule(data);
  }

  @Patch('rules/:id')
  @Roles(UserRole.OWNER)
  async updateRule(@Param('id') id: string, @Body() data: any) {
    return this.routingService.updateRule(id, data);
  }

  @Delete('rules/:id')
  @Roles(UserRole.OWNER)
  async deleteRule(@Param('id') id: string) {
    return this.routingService.deleteRule(id);
  }

  // ============ QUEUE MANAGEMENT ============

  @Get('queue/status')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getQueueStatus() {
    return this.routingService.getQueueStatus();
  }

  @Post('queue/:queueName/claim')
  async claimFromQueue(
    @Param('queueName') queueName: string,
    @Body() body: { managerId: string }
  ) {
    return this.routingService.claimFromQueue(queueName, body.managerId);
  }

  // ============ MANUAL ROUTING ============

  @Post('route-lead')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async routeLead(@Body() lead: any) {
    return this.routingService.routeLead(lead);
  }

  // ============ SEED ============

  @Post('seed-rules')
  @Roles(UserRole.OWNER)
  async seedRules() {
    await this.routingService.seedDefaultRules();
    return { success: true, message: 'Default routing rules seeded' };
  }
}
