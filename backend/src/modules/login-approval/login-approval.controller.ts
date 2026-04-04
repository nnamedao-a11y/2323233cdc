/**
 * Login Approval Controller
 * 
 * Routes:
 * POST /api/login-approval/request      - Create login request
 * POST /api/login-approval/:id/approve  - Approve request
 * POST /api/login-approval/:id/deny     - Deny request
 * GET  /api/login-approval/:id/status   - Get request status
 * GET  /api/login-approval/pending      - Get all pending requests (admin)
 */

import { Controller, Get, Post, Body, Param, Req, Query } from '@nestjs/common';
import { LoginApprovalService } from './login-approval.service';

@Controller('login-approval')
export class LoginApprovalController {
  constructor(private readonly approvalService: LoginApprovalService) {}

  /**
   * Create login request
   */
  @Post('request')
  async createRequest(
    @Body() body: {
      userId: string;
      userName: string;
      userEmail: string;
    },
    @Req() req: any
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    
    return this.approvalService.createLoginRequest(
      body.userId,
      body.userName,
      body.userEmail,
      { ip, userAgent }
    );
  }

  /**
   * Approve request
   */
  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() body: { approverId: string; approverName?: string }
  ) {
    return this.approvalService.approveRequest(id, body.approverId, body.approverName);
  }

  /**
   * Deny request
   */
  @Post(':id/deny')
  async deny(
    @Param('id') id: string,
    @Body() body: { denierId: string; reason?: string }
  ) {
    return this.approvalService.denyRequest(id, body.denierId, body.reason);
  }

  /**
   * Get request status
   */
  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.approvalService.getRequestStatus(id);
  }

  /**
   * Check if user has pending request
   */
  @Get('user/:userId/pending')
  async getPendingForUser(@Param('userId') userId: string) {
    const request = await this.approvalService.getPendingRequest(userId);
    return request ? { id: request.id, status: request.status } : null;
  }

  /**
   * Get all pending requests (admin)
   */
  @Get('pending')
  async getAllPending() {
    return this.approvalService.getPendingRequests();
  }

  /**
   * Poll for approval status (for frontend)
   */
  @Get(':id/poll')
  async poll(@Param('id') id: string) {
    const request = await this.approvalService.getRequestStatus(id);
    if (!request) {
      return { status: 'not_found' };
    }
    return {
      status: request.status,
      approved: request.status === 'approved',
      denied: request.status === 'denied',
      expired: request.status === 'expired',
    };
  }
}
