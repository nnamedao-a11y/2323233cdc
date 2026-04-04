/**
 * Auto-Call Controller
 * 
 * Admin API для налаштування автодзвінків
 */

import { Controller, Get, Post, Put, Body, Query, Param, HttpException, HttpStatus } from '@nestjs/common';
import { AutoCallService } from './auto-call.service';
import { CallStatus } from './schemas/auto-call-log.schema';

@Controller('auto-call')
export class AutoCallController {
  constructor(private readonly autoCallService: AutoCallService) {}

  /**
   * Get current configuration
   */
  @Get('config')
  async getConfig() {
    const config = await this.autoCallService.getConfig();
    return {
      enabled: config.enabled,
      twilioConfigured: !!config.twilioAccountSid && !!config.twilioPhoneNumber,
      twilioPhoneNumber: config.twilioPhoneNumber ? `***${config.twilioPhoneNumber.slice(-4)}` : null,
      managerPhones: config.managerPhones,
      voiceMessageTemplate: config.voiceMessageTemplate,
      workingHours: config.workingHours,
      timezone: config.timezone,
      hotIntentThreshold: config.hotIntentThreshold,
      callCooldownMs: config.callCooldownMs,
      notificationCooldownMs: config.notificationCooldownMs,
    };
  }

  /**
   * Update configuration
   */
  @Put('config')
  async updateConfig(@Body() body: any) {
    // Filter allowed fields
    const allowedFields = [
      'enabled',
      'twilioAccountSid',
      'twilioAuthToken',
      'twilioPhoneNumber',
      'managerPhones',
      'voiceMessageTemplate',
      'workingHours',
      'timezone',
      'hotIntentThreshold',
      'callCooldownMs',
      'notificationCooldownMs',
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const config = await this.autoCallService.updateConfig(updates);
    
    return {
      success: true,
      enabled: config.enabled,
      twilioConfigured: !!config.twilioAccountSid && !!config.twilioPhoneNumber,
    };
  }

  /**
   * Add manager phone
   */
  @Post('config/managers')
  async addManagerPhone(@Body() body: { phone: string }) {
    if (!body.phone) {
      throw new HttpException('Phone number required', HttpStatus.BAD_REQUEST);
    }

    const config = await this.autoCallService.getConfig();
    const phones = config.managerPhones || [];

    if (phones.includes(body.phone)) {
      throw new HttpException('Phone already exists', HttpStatus.CONFLICT);
    }

    phones.push(body.phone);
    await this.autoCallService.updateConfig({ managerPhones: phones });

    return { success: true, managerPhones: phones };
  }

  /**
   * Remove manager phone
   */
  @Post('config/managers/remove')
  async removeManagerPhone(@Body() body: { phone: string }) {
    const config = await this.autoCallService.getConfig();
    const phones = (config.managerPhones || []).filter(p => p !== body.phone);
    
    await this.autoCallService.updateConfig({ managerPhones: phones });

    return { success: true, managerPhones: phones };
  }

  /**
   * Test call
   */
  @Post('test')
  async testCall(@Body() body: { phone: string }) {
    if (!body.phone) {
      throw new HttpException('Phone number required', HttpStatus.BAD_REQUEST);
    }

    const result = await this.autoCallService.testCall(body.phone);
    
    if (!result.success) {
      throw new HttpException(result.error || 'Test call failed', HttpStatus.BAD_REQUEST);
    }

    return { success: true, callSid: result.callSid };
  }

  /**
   * Get call logs
   */
  @Get('logs')
  async getLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('userId') userId?: string,
    @Query('status') status?: CallStatus,
  ) {
    return this.autoCallService.getLogs(
      parseInt(page, 10),
      parseInt(limit, 10),
      { userId, status },
    );
  }

  /**
   * Get analytics
   */
  @Get('analytics')
  async getAnalytics() {
    return this.autoCallService.getAnalytics();
  }

  /**
   * Twilio status webhook
   */
  @Post('webhook/status')
  async handleStatusWebhook(@Body() body: any) {
    await this.autoCallService.handleStatusWebhook(body);
    return { success: true };
  }
}
