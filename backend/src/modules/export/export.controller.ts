import { Controller, Get, Query, Res, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.TEAM_LEAD, UserRole.OWNER)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('leads')
  async exportLeads(
    @Query() query: any,
    @Request() req,
    @Res() res: Response
  ) {
    const { status, source, assignedTo } = query;
    const filters: any = {};
    if (status) filters.status = status;
    if (source) filters.source = source;
    if (assignedTo) filters.assignedTo = assignedTo;

    const buffer = await this.exportService.exportLeads(filters, req.user.id);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=leads_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  }

  @Get('deals')
  async exportDeals(
    @Query() query: any,
    @Request() req,
    @Res() res: Response
  ) {
    const { status, customerId } = query;
    const filters: any = {};
    if (status) filters.status = status;
    if (customerId) filters.customerId = customerId;

    const buffer = await this.exportService.exportDeals(filters, req.user.id);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=deals_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  }

  @Get('deposits')
  async exportDeposits(
    @Query() query: any,
    @Request() req,
    @Res() res: Response
  ) {
    const { status, dealId, customerId } = query;
    const filters: any = {};
    if (status) filters.status = status;
    if (dealId) filters.dealId = dealId;
    if (customerId) filters.customerId = customerId;

    const buffer = await this.exportService.exportDeposits(filters, req.user.id);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=deposits_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  }

  @Get('tasks')
  async exportTasks(
    @Query() query: any,
    @Request() req,
    @Res() res: Response
  ) {
    const { status, priority, assignedTo } = query;
    const filters: any = {};
    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (assignedTo) filters.assignedTo = assignedTo;

    const buffer = await this.exportService.exportTasks(filters, req.user.id);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=tasks_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  }
}
