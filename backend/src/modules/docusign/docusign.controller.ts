/**
 * DocuSign Controller
 * 
 * Routes:
 * GET  /api/docusign/oauth/consent        - Get OAuth consent URL
 * GET  /api/docusign/callback             - OAuth callback (after consent)
 * POST /api/docusign/envelopes/create     - Create envelope
 * POST /api/docusign/envelopes/template   - Create envelope from template
 * POST /api/docusign/envelopes/:id/sign   - Get signing URL
 * GET  /api/docusign/envelopes/:id/status - Get envelope status
 * POST /api/docusign/envelopes/:id/complete - Mark as signed (mock)
 * GET  /api/docusign/envelopes/:id/document - Download signed PDF
 * POST /api/docusign/webhook              - DocuSign Connect webhook
 * GET  /api/docusign/config               - Get config status
 */

import { Controller, Get, Post, Body, Param, Req, Res, Query, Headers, HttpCode, Redirect, Logger } from '@nestjs/common';
import { DocusignService, CreateEnvelopeInput } from './docusign.service';
import { DocusignAuthService } from './docusign-auth.service';
import { Request, Response } from 'express';

@Controller('docusign')
export class DocusignController {
  private readonly logger = new Logger(DocusignController.name);

  constructor(
    private readonly docusignService: DocusignService,
    private readonly authService: DocusignAuthService,
  ) {}

  /**
   * Get OAuth consent URL
   * User must visit this URL once to grant consent for JWT impersonation
   */
  @Get('oauth/consent')
  getConsentUrl(@Query('redirect_uri') redirectUri?: string) {
    const consentUrl = this.authService.getConsentUrl(redirectUri);
    return {
      consentUrl,
      message: 'User must visit this URL to grant consent for DocuSign integration',
      instructions: [
        '1. Open consentUrl in browser',
        '2. Log in with DocuSign account',
        '3. Grant access to application',
        '4. After redirect, JWT auth will work'
      ]
    };
  }

  /**
   * OAuth callback after user grants consent
   */
  @Get('callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('event') event: string,
    @Query('envelopeId') envelopeId: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // If this is a signing completion callback
    if (event && envelopeId) {
      // Redirect to frontend with signing result
      return res.redirect(`${frontendUrl}/cabinet/contracts/return?event=${event}&envelopeId=${envelopeId}`);
    }

    // If this is OAuth consent callback with authorization code
    if (code) {
      try {
        // Exchange code for access token
        const tokenData = await this.authService.exchangeCodeForToken(code);
        
        // Consent granted! Refresh credentials so JWT auth works
        await this.authService.refreshCredentials();
        
        // If state contains redirect URL, use it
        if (state) {
          try {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            if (stateData.returnUrl) {
              return res.redirect(`${stateData.returnUrl}?docusign_connected=true`);
            }
          } catch (e) {
            // Invalid state, continue
          }
        }
        
        // Redirect to admin integrations page with success
        return res.redirect(`${frontendUrl}/admin/integrations?docusign_connected=true`);
      } catch (error) {
        this.logger.error(`OAuth callback error: ${error.message}`);
        return res.redirect(`${frontendUrl}/admin/integrations?docusign_error=${encodeURIComponent(error.message)}`);
      }
    }

    return res.json({ error: 'Missing code or event parameter' });
  }

  /**
   * Create and send envelope for signing
   */
  @Post('envelopes/create')
  async createEnvelope(@Body() body: CreateEnvelopeInput) {
    return this.docusignService.createEnvelope(body);
  }

  /**
   * Create envelope from DocuSign template
   */
  @Post('envelopes/template')
  async createFromTemplate(@Body() body: {
    templateId: string;
    signers: Array<{ email: string; name: string; roleName: string }>;
    subject?: string;
    message?: string;
    contractId?: string;
    userId?: string;
    dealId?: string;
  }) {
    return this.docusignService.createEnvelopeFromTemplate(body);
  }

  /**
   * Generate embedded signing URL
   */
  @Post('envelopes/:envelopeId/sign')
  @HttpCode(200)
  async getSigningUrl(
    @Param('envelopeId') envelopeId: string,
    @Body() body: {
      email: string;
      fullName: string;
      clientUserId: string;
      returnUrl?: string;
    }
  ) {
    return this.docusignService.createSigningUrl({
      envelopeId,
      ...body,
    });
  }

  /**
   * Get envelope status
   */
  @Get('envelopes/:envelopeId/status')
  async getStatus(@Param('envelopeId') envelopeId: string) {
    return this.docusignService.getEnvelopeStatus(envelopeId);
  }

  /**
   * Mark as signed (for mock/fallback flow)
   */
  @Post('envelopes/:envelopeId/complete')
  async markComplete(@Param('envelopeId') envelopeId: string) {
    return this.docusignService.markAsSigned(envelopeId);
  }

  /**
   * Download signed document
   */
  @Get('envelopes/:envelopeId/document')
  async getDocument(@Param('envelopeId') envelopeId: string, @Res() res: any) {
    const doc = await this.docusignService.getSignedDocument(envelopeId);
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not available' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=contract_${envelopeId}.pdf`);
    return res.send(doc);
  }

  /**
   * DocuSign Connect webhook
   * HMAC signature verification for security
   */
  @Post('webhook')
  async webhook(
    @Body() body: any, 
    @Req() req: any,
    @Headers('x-docusign-signature-1') signature?: string,
  ) {
    // Verify HMAC signature
    const isValid = await this.docusignService.verifyWebhookSignature(
      JSON.stringify(body),
      signature,
    );

    if (!isValid) {
      return { error: 'Invalid signature', received: false };
    }

    return this.docusignService.handleWebhookEvent(body);
  }

  /**
   * Get user's envelopes
   */
  @Get('envelopes/user/:userId')
  async getUserEnvelopes(@Param('userId') userId: string) {
    return this.docusignService.getUserEnvelopes(userId);
  }

  /**
   * Get configuration status
   */
  @Get('config')
  async getConfig() {
    const status = this.docusignService.getConfigStatus();
    return {
      ...status,
      baseUrl: this.authService.getBaseUrl(),
      accountId: this.authService.getAccountId(),
      consentUrl: this.authService.getConsentUrl(),
    };
  }

  /**
   * Test DocuSign connection
   */
  @Post('test')
  async testConnection() {
    try {
      const client = await this.authService.getApiClient();
      if (client) {
        return { success: true, message: 'DocuSign connection successful' };
      }
      return { success: false, message: 'Could not get API client' };
    } catch (error) {
      if (error.message?.startsWith('consent_required:')) {
        const consentUrl = error.message.split(':').slice(1).join(':');
        return { 
          success: false, 
          message: 'User consent required',
          consentUrl,
          action: 'User must visit consentUrl to grant access'
        };
      }
      return { success: false, message: error.message };
    }
  }
}
