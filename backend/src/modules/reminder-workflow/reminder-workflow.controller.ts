/**
 * Reminder Workflow Controller
 */

import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ReminderWorkflowService } from './reminder-workflow.service';
import { IntentScoringService } from './intent-scoring.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class ReminderWorkflowController {
  constructor(
    private readonly reminderService: ReminderWorkflowService,
    private readonly intentService: IntentScoringService,
  ) {}

  // Manual trigger
  @Post('trigger/auction-soon')
  async triggerAuctionSoon(@Body() body: { userId: string; vin: string; vehicleData: any }) {
    await this.reminderService.triggerAuctionSoonReminder(body.userId, body.vin, body.vehicleData);
    return { success: true };
  }

  @Post('trigger/price-changed')
  async triggerPriceChanged(@Body() body: { userId: string; vin: string; oldPrice: number; newPrice: number }) {
    await this.reminderService.triggerPriceChanged(body.userId, body.vin, body.oldPrice, body.newPrice);
    return { success: true };
  }
}

@Controller('admin/reminders')
@UseGuards(JwtAuthGuard)
export class ReminderAdminController {
  constructor(
    private readonly reminderService: ReminderWorkflowService,
  ) {}

  @Get('logs')
  async getLogs(@Query('page') page = '1', @Query('limit') limit = '100') {
    return this.reminderService.getNotificationLogs(parseInt(page, 10), parseInt(limit, 10));
  }

  @Get('analytics')
  async getAnalytics() {
    return this.reminderService.getAnalytics();
  }
}

@Controller('intent')
export class IntentController {
  constructor(private readonly intentService: IntentScoringService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyScore(@Query('userId') userId: string) {
    return this.intentService.getScore(userId);
  }
}

@Controller('admin/intent')
@UseGuards(JwtAuthGuard)
export class IntentAdminController {
  constructor(private readonly intentService: IntentScoringService) {}

  @Get('hot-leads')
  async getHotLeads(@Query('limit') limit = '50') {
    return this.intentService.getHotLeads(parseInt(limit, 10));
  }

  @Get('scores')
  async getAllScores(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.intentService.getAllScores(parseInt(page, 10), parseInt(limit, 10));
  }

  @Get('analytics')
  async getAnalytics() {
    return this.intentService.getAnalytics();
  }

  @Post('mark-notified/:userId')
  async markNotified(@Param('userId') userId: string) {
    await this.intentService.markManagerNotified(userId);
    return { success: true };
  }

  /**
   * Manually trigger HOT flow for testing
   * POST /api/admin/intent/trigger-hot/:userId
   */
  @Post('trigger-hot/:userId')
  async triggerHotFlow(@Param('userId') userId: string) {
    const result = await this.intentService.triggerHotFlowManually(userId);
    return { success: true, triggered: result };
  }
}
