/**
 * History Controller
 */

import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service';
import { RequestHistoryDto } from './dto/request-history.dto';
import { VerifiedUserGuard } from '../security/verified-user.guard';
import { getDeviceFingerprint, getClientIp } from '../security/device-fingerprint.util';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /**
   * Запит history report (тільки для верифікованих)
   */
  @UseGuards(JwtAuthGuard, VerifiedUserGuard)
  @Post('request')
  async request(@Req() req: any, @Body() dto: RequestHistoryDto) {
    const fp = getDeviceFingerprint(req);
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'];

    return this.historyService.request(
      req.user,
      dto.vin,
      fp,
      ip,
      ua,
    );
  }

  /**
   * Отримати існуючий report по VIN
   */
  @UseGuards(JwtAuthGuard)
  @Get('report/:vin')
  async getByVin(@Req() req: any, @Param('vin') vin: string) {
    return this.historyService.getReportByVin(
      req.user.id || req.user._id,
      vin,
    );
  }

  /**
   * Моя quota
   */
  @UseGuards(JwtAuthGuard)
  @Get('quota/me')
  async myQuota(@Req() req: any) {
    return this.historyService.getMyQuota(req.user.id || req.user._id);
  }
}

@Controller('admin/history')
@UseGuards(JwtAuthGuard)
export class HistoryAdminController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('analytics')
  async analytics() {
    return this.historyService.adminAnalytics();
  }

  @Get('requests')
  async requests(
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    return this.historyService.adminRequests(
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('reports')
  async reports(
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    return this.historyService.adminReports(
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Post('approve/:requestId')
  async approve(@Param('requestId') requestId: string) {
    return this.historyService.adminApprove(requestId);
  }

  @Post('block/:userId')
  async blockUser(
    @Param('userId') userId: string,
    @Body('reason') reason: string,
  ) {
    return this.historyService.adminBlockUser(userId, reason || 'admin_blocked');
  }

  @Post('unblock/:userId')
  async unblockUser(@Param('userId') userId: string) {
    return this.historyService.adminUnblockUser(userId);
  }
}
