import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CallCenterService } from './call-center.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallResult, CommunicationChannel } from '../../shared/enums';

@Controller('call-center')
@UseGuards(JwtAuthGuard)
export class CallCenterController {
  constructor(private readonly callCenterService: CallCenterService) {}

  @Post('calls')
  async logCall(@Body() data: {
    leadId: string;
    customerId?: string;
    channel?: CommunicationChannel;
    result: CallResult;
    duration?: number;
    notes?: string;
    nextFollowUpDate?: string;
  }, @Request() req) {
    return this.callCenterService.logCall({
      ...data,
      managerId: req.user.id,
      nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : undefined,
    });
  }

  @Get('calls/:leadId')
  async getCallHistory(@Param('leadId') leadId: string) {
    return this.callCenterService.getCallHistory(leadId);
  }

  @Post('callbacks')
  async scheduleCallback(@Body() data: {
    leadId: string;
    customerId?: string;
    scheduledAt: string;
    notes?: string;
    priority?: number;
  }, @Request() req) {
    return this.callCenterService.scheduleCallback({
      ...data,
      assignedTo: req.user.id,
      scheduledAt: new Date(data.scheduledAt),
    });
  }

  @Get('callbacks')
  async getMyCallbacks(@Request() req, @Query('status') status?: string) {
    return this.callCenterService.getCallbackQueue(req.user.id, status);
  }

  @Put('callbacks/:id/complete')
  async completeCallback(@Param('id') id: string, @Body('notes') notes?: string) {
    return this.callCenterService.completeCallback(id, notes);
  }

  @Get('stats')
  async getStats(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('managerId') managerId?: string
  ) {
    return this.callCenterService.getStats(
      managerId || req.user.id,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
  }
}
