import { Controller, Post, Get, Body, Param, Headers, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService, TwilioStatusWebhookDto } from './webhook.service';

/**
 * Webhook Controller - Публічні endpoints для провайдерів
 * 
 * ВАЖЛИВО: Ці endpoints НЕ захищені JWT, бо викликаються зовнішніми сервісами
 * Використовується signature verification замість JWT
 */
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Twilio SMS Status Callback
   * 
   * Endpoint: POST /api/webhooks/twilio/status
   * 
   * Twilio надсилає POST request при зміні статусу SMS:
   * - queued → sent → delivered
   * - queued → sent → undelivered
   * - queued → failed
   * 
   * Configure in Twilio Console:
   * - Status Callback URL: https://your-domain/api/webhooks/twilio/status
   */
  @Post('twilio/status')
  @HttpCode(HttpStatus.OK) // Twilio очікує 200 OK
  async handleTwilioStatus(
    @Body() dto: TwilioStatusWebhookDto,
    @Headers('x-twilio-signature') signature: string,
    @Req() req: Request
  ) {
    // Отримуємо повний URL для валідації
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    const result = await this.webhookService.processTwilioStatus(dto, signature, fullUrl);
    
    // Twilio очікує пусту відповідь або TwiML
    return result.success 
      ? { received: true, messageId: result.messageId, status: result.status }
      : { received: false };
  }

  /**
   * Перевірити статус повідомлення вручну
   * 
   * Endpoint: GET /api/webhooks/messages/:messageId/status
   */
  @Get('messages/:messageId/status')
  async getMessageStatus(@Param('messageId') messageId: string) {
    return this.webhookService.getMessageStatus(messageId);
  }

  /**
   * Resend Email Webhook (placeholder)
   * 
   * Endpoint: POST /api/webhooks/resend/status
   */
  @Post('resend/status')
  @HttpCode(HttpStatus.OK)
  async handleResendStatus(@Body() dto: any) {
    // TODO: Implement Resend webhook handling
    // Resend sends webhooks for: delivered, bounced, complained, etc.
    return { received: true };
  }

  /**
   * Viber Webhook (placeholder)
   * 
   * Endpoint: POST /api/webhooks/viber
   */
  @Post('viber')
  @HttpCode(HttpStatus.OK)
  async handleViberWebhook(@Body() dto: any) {
    // TODO: Implement Viber Business webhook handling
    return { received: true };
  }

  /**
   * Health check для webhook endpoint
   */
  @Get('health')
  healthCheck() {
    return { 
      status: 'ok',
      timestamp: new Date().toISOString(),
      endpoints: [
        'POST /api/webhooks/twilio/status',
        'POST /api/webhooks/resend/status',
        'POST /api/webhooks/viber',
        'GET /api/webhooks/messages/:messageId/status'
      ]
    };
  }
}
