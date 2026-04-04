import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Req, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HistoryReportService, RequestReportDto, ApproveReportDto } from './history-report.service';
import { UserRole } from '../../shared/enums';

// Helper to check roles including legacy ones
const isOwner = (role: string) => role === UserRole.OWNER || role === 'master_admin' || role === 'finance';
const isTeamLead = (role: string) => role === UserRole.TEAM_LEAD || role === 'admin' || role === 'moderator';
const isManager = (role: string) => role === UserRole.MANAGER;

@Controller('admin/history-reports')
@UseGuards(JwtAuthGuard)
export class HistoryReportController {
  constructor(private readonly service: HistoryReportService) {}

  // === USER ENDPOINTS ===

  // Check if user can access report
  @Get('check/:vin')
  async checkAccess(
    @Req() req: any,
    @Param('vin') vin: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const user = req.user;
    return this.service.canAccessReport(user.id, vin, deviceId);
  }

  // Request a report (creates pending request)
  @Post('request')
  async requestReport(
    @Req() req: any,
    @Body() body: { vin: string; leadId?: string },
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-forwarded-for') ipAddress?: string,
  ) {
    const user = req.user;
    
    const dto: RequestReportDto = {
      vin: body.vin,
      leadId: body.leadId,
      userId: user.id,
      deviceId,
      ipAddress,
    };

    return this.service.requestReport(dto);
  }

  // Get user's reports (cabinet)
  @Get('my-reports')
  async getMyReports(@Req() req: any) {
    const user = req.user;
    return this.service.getUserReports(user.id);
  }

  // Get specific report by VIN
  @Get('vin/:vin')
  async getReportByVin(
    @Req() req: any,
    @Param('vin') vin: string,
  ) {
    const user = req.user;
    
    // First check access
    const access = await this.service.canAccessReport(user.id, vin);
    if (!access.allowed && !access.cached) {
      return { 
        error: 'Access denied',
        reason: access.reason,
        requiresCall: access.requiresCall,
        requiresApproval: access.requiresApproval,
      };
    }

    const report = await this.service.getReportByVin(vin);
    if (!report) {
      return { error: 'Report not found' };
    }

    // Deliver to user (increment view count)
    return this.service.deliverReport(report.id, user.id);
  }

  // === MANAGER ENDPOINTS ===

  // Get pending reports for approval
  @Get('pending')
  async getPendingReports(@Req() req: any) {
    const user = req.user;

    if (isManager(user.role)) {
      return this.service.getPendingReports(user.id);
    }

    if (isTeamLead(user.role) || isOwner(user.role)) {
      return this.service.getPendingReports(); // All pending
    }

    return { error: 'Access denied' };
  }

  // Approve report (manager decision)
  @Put('approve/:id')
  async approveReport(
    @Req() req: any,
    @Param('id') reportId: string,
    @Body() body: { note?: string },
  ) {
    const user = req.user;

    if (!isManager(user.role) && !isTeamLead(user.role) && !isOwner(user.role)) {
      return { error: 'Only managers can approve reports' };
    }

    const dto: ApproveReportDto = {
      reportId,
      managerId: user.id,
      note: body.note,
    };

    return this.service.approveReport(dto);
  }

  // Deny report
  @Put('deny/:id')
  async denyReport(
    @Req() req: any,
    @Param('id') reportId: string,
    @Body() body: { reason: string },
  ) {
    const user = req.user;

    if (!isManager(user.role) && !isTeamLead(user.role) && !isOwner(user.role)) {
      return { error: 'Only managers can deny reports' };
    }

    return this.service.denyReport(reportId, user.id, body.reason);
  }

  // === ADMIN ENDPOINTS ===

  // Get analytics
  @Get('analytics')
  async getAnalytics(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const user = req.user;

    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied. Owner/Team Lead only.' };
    }

    const periodDays = parseInt(period || '30');
    return this.service.getAnalytics(periodDays);
  }

  // Check manager abuse
  @Get('abuse-check/:managerId')
  async checkManagerAbuse(
    @Req() req: any,
    @Param('managerId') managerId: string,
    @Query('period') period?: string,
  ) {
    const user = req.user;

    if (!isOwner(user.role)) {
      return { error: 'Access denied. Owner only.' };
    }

    const periodDays = parseInt(period || '7');
    return this.service.checkManagerAbuse(managerId, periodDays);
  }

  // Get report by ID
  @Get(':id')
  async getReportById(
    @Req() req: any,
    @Param('id') reportId: string,
  ) {
    const user = req.user;

    // Managers can see reports they manage
    // Owners can see all
    // TODO: Add proper access control

    const report = await this.service.getReportByVin(reportId);
    return report || { error: 'Report not found' };
  }
}
