import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards,
  Request,
} from '@nestjs/common';
import { LeadRoutingService } from '../services/lead-routing.service';
import { RoutingRulesService } from '../services/routing-rules.service';
import { 
  CreateRoutingRuleDto, 
  UpdateRoutingRuleDto, 
  AssignLeadDto, 
  ReassignLeadDto,
  ResolveFallbackDto,
} from '../dto/routing.dto';

@Controller('lead-routing')
export class LeadRoutingController {
  constructor(
    private readonly routingService: LeadRoutingService,
    private readonly rulesService: RoutingRulesService,
  ) {}

  // =============== ASSIGNMENT ENDPOINTS ===============

  /**
   * Assign lead to manager (auto or forced)
   */
  @Post('assign/:leadId')
  async assignLead(
    @Param('leadId') leadId: string,
    @Body() dto: AssignLeadDto,
  ) {
    return this.routingService.assignLead(leadId, dto);
  }

  /**
   * Manual reassignment by admin
   */
  @Post('reassign/:leadId')
  async reassignLead(
    @Param('leadId') leadId: string,
    @Body() dto: ReassignLeadDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.routingService.reassignLead(leadId, dto, userId);
  }

  /**
   * Get assignment history for a lead
   */
  @Get('history/:leadId')
  async getHistory(@Param('leadId') leadId: string) {
    return this.routingService.getHistory(leadId);
  }

  /**
   * Get manager workload matrix
   */
  @Get('workload')
  async getWorkloadMatrix() {
    return this.routingService.getWorkloadMatrix();
  }

  // =============== FALLBACK QUEUE ENDPOINTS ===============

  /**
   * Get fallback queue items
   */
  @Get('fallback-queue')
  async getFallbackQueue() {
    return this.routingService.getFallbackQueue();
  }

  /**
   * Resolve fallback queue item
   */
  @Post('fallback-queue/:historyId/resolve')
  async resolveFallbackItem(
    @Param('historyId') historyId: string,
    @Body() dto: ResolveFallbackDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.routingService.resolveFallbackQueueItem(historyId, dto.managerId, userId);
  }

  // =============== ROUTING RULES ENDPOINTS ===============

  /**
   * Get all routing rules
   */
  @Get('rules')
  async getRules(@Query('includeInactive') includeInactive: string) {
    return this.rulesService.findAll(includeInactive === 'true');
  }

  /**
   * Get single rule by ID
   */
  @Get('rules/:id')
  async getRule(@Param('id') id: string) {
    return this.rulesService.findById(id);
  }

  /**
   * Create new routing rule
   */
  @Post('rules')
  async createRule(
    @Body() dto: CreateRoutingRuleDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.rulesService.create(dto, userId);
  }

  /**
   * Update routing rule
   */
  @Patch('rules/:id')
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateRoutingRuleDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.rulesService.update(id, dto, userId);
  }

  /**
   * Toggle rule active status
   */
  @Post('rules/:id/toggle')
  async toggleRule(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.rulesService.toggle(id, userId);
  }

  /**
   * Delete routing rule
   */
  @Delete('rules/:id')
  async deleteRule(@Param('id') id: string) {
    return this.rulesService.delete(id);
  }
}
