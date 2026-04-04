/**
 * VIN Lead Controller
 * 
 * Auto-lead creation from VIN search:
 * - POST /leads/from-vin - Create lead from VIN result (no auth required)
 * - Automatic customer linking
 * - Task generation
 * - Manager notifications
 */

import { Controller, Post, Body, Req, Logger } from '@nestjs/common';
import { VinLeadService } from './vin-lead.service';

export class CreateVinLeadDto {
  vin: string;
  maxBid?: number;
  finalPrice?: number;
  marketPrice?: number;
  dealStatus?: string;
  vehicle?: {
    make?: string;
    model?: string;
    year?: number;
    damage?: string;
  };
  // Optional user info (if not logged in)
  phone?: string;
  email?: string;
  firstName?: string;
  // A/B testing
  variant?: 'A' | 'B';
}

@Controller('leads')
export class VinLeadController {
  private readonly logger = new Logger(VinLeadController.name);

  constructor(private readonly vinLeadService: VinLeadService) {}

  /**
   * POST /api/leads/from-vin
   * 
   * Create lead from VIN search - NO AUTH REQUIRED
   * This is the money endpoint!
   */
  @Post('from-vin')
  async createFromVin(
    @Body() dto: CreateVinLeadDto,
    @Req() req: any,
  ) {
    this.logger.log(`[VinLead] Creating lead for VIN: ${dto.vin}`);
    
    // Get user ID from session if available
    const userId = req.user?.sub || req.user?.id || null;
    const customerId = req.user?.customerId || null;

    return this.vinLeadService.createFromVin({
      ...dto,
      userId,
      customerId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
