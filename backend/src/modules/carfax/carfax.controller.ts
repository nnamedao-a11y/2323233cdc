/**
 * Carfax Manual Flow Controller
 * 
 * Routes:
 * POST /api/carfax/request - User creates request
 * GET  /api/carfax/me - User's requests
 * GET  /api/carfax/:id - Get single request
 * 
 * GET   /api/carfax/admin/queue - Manager queue
 * PATCH /api/carfax/:id/approve - Approve request
 * PATCH /api/carfax/:id/reject - Reject request
 * POST  /api/carfax/:id/upload-pdf - Upload PDF
 * GET   /api/carfax/admin/analytics - Analytics dashboard
 */

import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CarfaxService } from './carfax.service';
import { CarfaxRequestStatus } from './carfax.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('carfax')
export class CarfaxController {
  constructor(private readonly carfaxService: CarfaxService) {}

  // === USER ENDPOINTS ===

  @Post('request')
  async createRequest(@Body() body: any, @Req() req: any) {
    const userId = req.user?.id || body.userId || 'anonymous';
    const userName = req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : body.userName || 'Guest';
    
    return this.carfaxService.createRequest({
      userId,
      userName,
      userPhone: body.phone,
      userEmail: body.email || req.user?.email,
      vin: body.vin,
    });
  }

  @Get('me')
  async getMyRequests(@Req() req: any) {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) {
      return [];
    }
    return this.carfaxService.getUserRequests(userId);
  }

  @Get('request/:id')
  async getRequest(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.carfaxService.getRequest(id, userId);
  }

  // === ADMIN ENDPOINTS ===

  @Get('admin/queue')
  async getAdminQueue(@Query('status') status?: CarfaxRequestStatus) {
    return this.carfaxService.getAdminQueue(status);
  }

  @Get('admin/all')
  async getAllRequests() {
    return this.carfaxService.getAdminQueue(undefined);
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Req() req: any) {
    const managerId = req.user?.id || 'admin';
    const managerName = req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : 'Admin';
    
    return this.carfaxService.approve(id, managerId, managerName);
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: any) {
    const managerId = req.user?.id || 'admin';
    const managerName = req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : 'Admin';
    
    return this.carfaxService.reject(id, managerId, managerName, body.reason);
  }

  @Patch(':id/processing')
  async setProcessing(@Param('id') id: string, @Req() req: any) {
    // Alias for approve
    return this.approve(id, req);
  }

  @Post(':id/upload-pdf')
  async uploadPdf(
    @Param('id') id: string,
    @Body() body: { pdfUrl: string; pdfFilename?: string; actualCost?: number },
    @Req() req: any
  ) {
    const managerId = req.user?.id || 'admin';
    const managerName = req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : 'Admin';
    
    return this.carfaxService.uploadPdf(
      id,
      managerId,
      managerName,
      body.pdfUrl,
      body.pdfFilename || 'carfax-report.pdf',
      body.actualCost
    );
  }

  @Get('admin/analytics')
  async getAnalytics(@Query('period') period?: string) {
    const periodDays = parseInt(period || '30', 10);
    return this.carfaxService.getAnalytics(periodDays);
  }
}
