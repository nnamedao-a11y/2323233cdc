import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import { SMSProviderManager } from './providers/sms-provider.manager';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, CommunicationChannel } from '../../shared/enums';

@Controller('communications')
@UseGuards(JwtAuthGuard)
export class CommunicationsController {
  constructor(
    private readonly communicationsService: CommunicationsService,
    private readonly smsProviderManager: SMSProviderManager,
  ) {}

  // Надіслати повідомлення
  @Post('send')
  async sendMessage(@Body() data: {
    channel: CommunicationChannel;
    recipientId: string;
    recipientEmail?: string;
    recipientPhone?: string;
    templateId?: string;
    subject?: string;
    content?: string;
    variables?: Record<string, any>;
  }, @Request() req) {
    return this.communicationsService.sendMessage({
      ...data,
      sentBy: req.user.id,
    });
  }

  // Надіслати SMS напряму
  @Post('sms/send')
  async sendSMS(@Body() data: {
    phone: string;
    message: string;
    leadId?: string;
    customerId?: string;
  }, @Request() req) {
    return this.smsProviderManager.send({
      to: data.phone,
      message: data.message,
      metadata: {
        leadId: data.leadId,
        customerId: data.customerId,
      },
    });
  }

  // Статус SMS провайдерів
  @Get('sms/providers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getSMSProviders() {
    return this.smsProviderManager.getProvidersStatus();
  }

  // Історія комунікацій по ліду/клієнту
  @Get('history/:recipientId')
  async getHistory(
    @Param('recipientId') recipientId: string,
    @Query('channel') channel?: CommunicationChannel
  ) {
    return this.communicationsService.getHistory(recipientId, channel);
  }

  // Шаблони
  @Post('templates')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async createTemplate(@Body() data: any, @Request() req) {
    return this.communicationsService.createTemplate({
      ...data,
      createdBy: req.user.id,
    });
  }

  @Get('templates')
  async findAllTemplates(@Query('channel') channel?: CommunicationChannel) {
    return this.communicationsService.findAllTemplates(channel);
  }

  @Put('templates/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async updateTemplate(@Param('id') id: string, @Body() data: any) {
    return this.communicationsService.updateTemplate(id, data);
  }

  @Delete('templates/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async deleteTemplate(@Param('id') id: string) {
    return this.communicationsService.deleteTemplate(id);
  }
}
