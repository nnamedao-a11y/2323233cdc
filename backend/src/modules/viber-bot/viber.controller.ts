/**
 * Viber Bot - Webhook Controller
 * 
 * Handles Viber webhook events
 */

import { Body, Controller, Get, Post, Logger } from '@nestjs/common';
import { ViberService } from './viber.service';
import { ViberRouterService } from './viber-router.service';

@Controller('viber-bot')
export class ViberController {
  private readonly logger = new Logger(ViberController.name);

  constructor(
    private readonly viber: ViberService,
    private readonly router: ViberRouterService,
  ) {}

  /**
   * Status endpoint
   */
  @Get('status')
  async getStatus() {
    const accountInfo = await this.viber.getAccountInfo();
    return {
      ok: true,
      configured: !!process.env.VIBER_TOKEN,
      account: accountInfo ? {
        name: accountInfo.name,
        uri: accountInfo.uri,
        subscribersCount: accountInfo.subscribers_count,
      } : null,
    };
  }

  /**
   * Set webhook endpoint
   */
  @Post('set-webhook')
  async setWebhook(@Body() body: { url: string }) {
    const result = await this.viber.setWebhook(body.url);
    return { ok: !!result, result };
  }

  /**
   * Main webhook handler
   */
  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    try {
      const event = body.event;

      this.logger.debug(`Viber event: ${event}`);

      // Conversation started (first contact)
      if (event === 'conversation_started') {
        const userId = body.user?.id;
        const context = body.context; // Deep link param

        if (userId) {
          const response = await this.router.handleConversationStarted(userId, context);
          return response;
        }
      }

      // Message received
      if (event === 'message') {
        const userId = body.sender?.id;
        const text = body.message?.text;

        if (userId && text) {
          await this.router.handleMessage(userId, text);
        }
      }

      // Subscribed
      if (event === 'subscribed') {
        const userId = body.user?.id;
        if (userId) {
          await this.router.handleConversationStarted(userId);
        }
      }

      // Other events (delivered, seen, failed) - just acknowledge
      return { status: 0 };
    } catch (error) {
      this.logger.error(`Viber webhook error: ${error}`);
      return { status: 1, error: String(error) };
    }
  }
}
