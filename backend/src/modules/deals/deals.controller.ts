import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';
import { DealStage } from '../blueprint/blueprint-stage.enum';

/**
 * Deals Controller v3.0 - Blueprint-Integrated
 * 
 * KEY CHANGE: All stage changes go through /deals/:id/move-stage
 * Direct status updates are FORBIDDEN
 */

class MoveStageDto {
  @IsString()
  @IsNotEmpty()
  to: string;
}

class UpdateFlagsDto {
  @IsBoolean()
  @IsOptional()
  contractSigned?: boolean;
  
  @IsString()
  @IsOptional()
  contractId?: string;
  
  @IsBoolean()
  @IsOptional()
  invoiceCreated?: boolean;
  
  @IsBoolean()
  @IsOptional()
  depositPaid?: boolean;
  
  @IsBoolean()
  @IsOptional()
  fullPaymentDone?: boolean;
  
  @IsBoolean()
  @IsOptional()
  shipmentCreated?: boolean;
  
  @IsString()
  @IsOptional()
  shipmentId?: string;
  
  @IsBoolean()
  @IsOptional()
  trackingAdded?: boolean;
  
  @IsBoolean()
  @IsOptional()
  shipmentDelivered?: boolean;
}

@Controller('deals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  // ============ BLUEPRINT STAGE CONTROL ============

  /**
   * ЕДИНСТВЕННЫЙ endpoint для изменения stage
   */
  @Patch(':id/move-stage')
  async moveStage(
    @Param('id') id: string,
    @Body() body: { to: string },
    @Request() req
  ) {
    const to = body?.to as DealStage;
    
    if (!to || !Object.values(DealStage).includes(to)) {
      throw new BadRequestException(`Invalid stage: ${body?.to}. Valid stages: ${Object.values(DealStage).join(', ')}`);
    }

    return this.dealsService.moveStage(id, to, req.user.id, req.user.role);
  }

  /**
   * Get allowed transitions for a deal
   */
  @Get(':id/allowed-transitions')
  async getAllowedTransitions(@Param('id') id: string) {
    return this.dealsService.getAllowedTransitions(id);
  }

  // ============ FLAG UPDATES (for Blueprint validation) ============

  /**
   * Update deal flags (contract signed, payment, shipment, etc.)
   * These flags are used by Blueprint to validate stage transitions
   */
  @Patch(':id/flags')
  async updateFlags(
    @Param('id') id: string,
    @Body() dto: UpdateFlagsDto
  ) {
    return this.dealsService.updateFlags(id, dto);
  }

  /**
   * Record a call (increments callCount, sets hasCalls = true)
   */
  @Post(':id/record-call')
  async recordCall(@Param('id') id: string) {
    return this.dealsService.recordCall(id);
  }

  // ============ STANDARD CRUD ============

  @Post()
  async create(@Body() data: any, @Request() req) {
    return this.dealsService.create(data, req.user.id);
  }

  @Post('from-lead')
  async createFromLead(
    @Body() data: { leadId: string; quoteId?: string; notes?: string },
    @Request() req
  ) {
    return this.dealsService.createFromLead(data, req.user.id);
  }

  @Get()
  async findAll(@Query() query: any) {
    return this.dealsService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getStats() {
    return this.dealsService.getStats();
  }

  @Get('pipeline-analytics')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getPipelineAnalytics() {
    return this.dealsService.getPipelineAnalytics();
  }

  @Get('lead/:leadId')
  async findByLeadId(@Param('leadId') leadId: string) {
    return this.dealsService.findByLeadId(leadId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.dealsService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    // Remove stage from data to prevent direct updates
    delete data.stage;
    delete data.status;
    return this.dealsService.update(id, data);
  }

  // DEPRECATED: Use /move-stage instead
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; notes?: string }
  ) {
    throw new BadRequestException(
      'DEPRECATED: Use PATCH /deals/:id/move-stage with Blueprint stage instead'
    );
  }

  @Patch(':id/finance')
  async updateFinance(
    @Param('id') id: string,
    @Body() body: {
      purchasePrice?: number;
      clientPrice?: number;
      internalCost?: number;
      realCost?: number;
      realRevenue?: number;
    }
  ) {
    return this.dealsService.updateFinance(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async delete(@Param('id') id: string) {
    return this.dealsService.delete(id);
  }
}
