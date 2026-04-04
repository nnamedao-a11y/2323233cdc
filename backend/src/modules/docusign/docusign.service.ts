/**
 * DocuSign Service
 * 
 * Core DocuSign operations:
 * - Create envelope (send document for signing)
 * - Generate embedded signing URL
 * - Get envelope status
 * - Download signed document
 * - Webhook signature verification
 */

import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID, createHmac } from 'crypto';
import { DocusignAuthService } from './docusign-auth.service';
import { ContractEnvelope, ContractEnvelopeDocument, EnvelopeStatus } from './contract-envelope.schema';
import { generateId } from '../../shared/utils';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';

export interface CreateEnvelopeInput {
  contractId: string;
  userId: string;
  dealId?: string;
  email: string;
  fullName: string;
  pdfBase64: string;
  fileName: string;
  emailSubject?: string;
}

export interface SigningUrlInput {
  envelopeId: string;
  email: string;
  fullName: string;
  clientUserId: string;
  returnUrl?: string;
}

@Injectable()
export class DocusignService {
  private readonly logger = new Logger(DocusignService.name);

  constructor(
    @InjectModel(ContractEnvelope.name) private envelopeModel: Model<ContractEnvelope>,
    @InjectModel('Contract') private contractModel: Model<any>,
    private authService: DocusignAuthService,
    @Inject(forwardRef(() => IntegrationConfigService))
    private integrationConfigService: IntegrationConfigService,
  ) {}

  /**
   * Verify DocuSign webhook HMAC signature
   */
  async verifyWebhookSignature(body: string, signature?: string): Promise<boolean> {
    if (!signature) {
      this.logger.warn('DocuSign webhook: No signature provided');
      return false;
    }

    try {
      const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.DOCUSIGN);
      const hmacKey = credentials?.hmacKey || credentials?.webhookSecret;

      if (!hmacKey) {
        // SECURITY: In production, no key = reject
        this.logger.warn('DocuSign HMAC key not configured - webhook verification skipped');
        // For backward compatibility, allow if not configured (but log warning)
        return true;
      }

      const computed = createHmac('sha256', hmacKey)
        .update(body)
        .digest('base64');

      if (computed !== signature) {
        this.logger.error('DocuSign webhook: Invalid HMAC signature');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`DocuSign signature verification error: ${error.message}`);
      return false;
    }
  }

  /**
   * Create and send envelope for signing
   */
  async createEnvelope(input: CreateEnvelopeInput): Promise<ContractEnvelope> {
    const clientUserId = randomUUID();

    // Create envelope record
    const envelope = new this.envelopeModel({
      id: generateId(),
      contractId: input.contractId,
      userId: input.userId,
      dealId: input.dealId,
      email: input.email,
      fullName: input.fullName,
      clientUserId,
      status: EnvelopeStatus.DRAFT,
    });

    // Check if DocuSign is configured
    if (!this.authService.isConfigured()) {
      this.logger.warn('DocuSign not configured - using mock envelope');
      envelope.envelopeId = `mock_env_${envelope.id}`;
      envelope.status = EnvelopeStatus.SENT;
      envelope.sentAt = new Date();
      await envelope.save();

      // Update contract
      await this.contractModel.updateOne(
        { id: input.contractId },
        { $set: { envelopeId: envelope.envelopeId, status: 'sent' } }
      );

      return envelope;
    }

    try {
      const apiClient = await this.authService.getApiClient();
      if (!apiClient) {
        throw new Error('Failed to get DocuSign API client');
      }

      const docusign = await import('docusign-esign');
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      // Create document
      const document = docusign.Document.constructFromObject({
        documentBase64: input.pdfBase64,
        name: input.fileName,
        fileExtension: 'pdf',
        documentId: '1',
      });

      // Create signature tab (anchor-based)
      const signHere = docusign.SignHere.constructFromObject({
        anchorString: '/signature/',
        anchorUnits: 'pixels',
        anchorXOffset: '10',
        anchorYOffset: '10',
      });

      // Create signer with embedded signing
      const signer = docusign.Signer.constructFromObject({
        email: input.email,
        name: input.fullName,
        recipientId: '1',
        routingOrder: '1',
        clientUserId,
        tabs: {
          signHereTabs: [signHere],
        },
      });

      // Create envelope definition
      const envelopeDefinition = docusign.EnvelopeDefinition.constructFromObject({
        emailSubject: input.emailSubject || 'BIBI Cars - Будь ласка, підпишіть договір',
        documents: [document],
        recipients: { signers: [signer] },
        status: 'sent',
      });

      // Send envelope
      const result = await envelopesApi.createEnvelope(
        this.authService.getAccountId(),
        { envelopeDefinition },
      );

      envelope.envelopeId = result.envelopeId;
      envelope.status = EnvelopeStatus.SENT;
      envelope.sentAt = new Date();
      await envelope.save();

      // Update contract
      await this.contractModel.updateOne(
        { id: input.contractId },
        { $set: { envelopeId: result.envelopeId, status: 'sent', sentAt: new Date() } }
      );

      this.logger.log(`Envelope created: ${result.envelopeId} for contract ${input.contractId}`);

      return envelope;
    } catch (error) {
      this.logger.error(`Failed to create envelope: ${error.message}`);
      envelope.status = EnvelopeStatus.ERROR;
      envelope.meta = { error: error.message };
      await envelope.save();
      throw error;
    }
  }

  /**
   * Generate embedded signing URL
   */
  async createSigningUrl(input: SigningUrlInput): Promise<{ signingUrl: string }> {
    const envelope = await this.envelopeModel.findOne({ envelopeId: input.envelopeId });
    if (!envelope) {
      throw new NotFoundException('Envelope not found');
    }

    // Mock mode
    if (!this.authService.isConfigured() || input.envelopeId.startsWith('mock_')) {
      const mockUrl = `${input.returnUrl || this.authService.getReturnUrl()}?event=signing_complete&envelopeId=${input.envelopeId}`;
      return { signingUrl: mockUrl };
    }

    try {
      const apiClient = await this.authService.getApiClient();
      if (!apiClient) {
        throw new Error('Failed to get DocuSign API client');
      }

      const docusign = await import('docusign-esign');
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      // Create recipient view request
      const viewRequest = docusign.RecipientViewRequest.constructFromObject({
        authenticationMethod: 'none',
        clientUserId: input.clientUserId,
        recipientId: '1',
        returnUrl: input.returnUrl || this.authService.getReturnUrl(),
        userName: input.fullName,
        email: input.email,
      });

      const view = await envelopesApi.createRecipientView(
        this.authService.getAccountId(),
        input.envelopeId,
        { recipientViewRequest: viewRequest },
      );

      this.logger.log(`Signing URL generated for envelope ${input.envelopeId}`);

      return { signingUrl: view.url };
    } catch (error) {
      this.logger.error(`Failed to create signing URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get envelope status
   */
  async getEnvelopeStatus(envelopeId: string): Promise<any> {
    const envelope = await this.envelopeModel.findOne({ envelopeId }).lean();
    if (!envelope) {
      throw new NotFoundException('Envelope not found');
    }

    // Mock mode - return stored status
    if (!this.authService.isConfigured() || envelopeId.startsWith('mock_')) {
      return {
        envelopeId,
        status: envelope.status,
        completedAt: envelope.completedAt,
      };
    }

    try {
      const apiClient = await this.authService.getApiClient();
      if (!apiClient) {
        return { envelopeId, status: envelope.status };
      }

      const docusign = await import('docusign-esign');
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      const result = await envelopesApi.getEnvelope(
        this.authService.getAccountId(),
        envelopeId,
      );

      // Update local status
      await this.envelopeModel.updateOne(
        { envelopeId },
        { $set: { status: result.status, meta: { docusignStatus: result } } }
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to get envelope status: ${error.message}`);
      return { envelopeId, status: envelope.status };
    }
  }

  /**
   * Download signed document
   */
  async getSignedDocument(envelopeId: string): Promise<Buffer | null> {
    // Mock mode
    if (!this.authService.isConfigured() || envelopeId.startsWith('mock_')) {
      return null;
    }

    try {
      const apiClient = await this.authService.getApiClient();
      if (!apiClient) {
        return null;
      }

      const docusign = await import('docusign-esign');
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      const file = await envelopesApi.getDocument(
        this.authService.getAccountId(),
        envelopeId,
        'combined',
      );

      return file;
    } catch (error) {
      this.logger.error(`Failed to get signed document: ${error.message}`);
      return null;
    }
  }

  /**
   * Handle webhook event (envelope completed, declined, etc.)
   */
  async handleWebhookEvent(payload: any): Promise<any> {
    const envelopeId = payload?.data?.envelopeId || payload?.envelopeId;
    const status = payload?.data?.envelopeSummary?.status || payload?.status;

    if (!envelopeId) {
      this.logger.warn('Webhook received without envelopeId');
      return { ok: false };
    }

    const envelope = await this.envelopeModel.findOne({ envelopeId });
    if (!envelope) {
      this.logger.warn(`Envelope not found for webhook: ${envelopeId}`);
      return { ok: false, error: 'Envelope not found' };
    }

    // Update envelope status
    if (status === 'completed') {
      envelope.status = EnvelopeStatus.COMPLETED;
      envelope.completedAt = new Date();

      // Update contract status
      await this.contractModel.updateOne(
        { id: envelope.contractId },
        { 
          $set: { 
            status: 'signed', 
            signedAt: new Date(),
            hasSignedContract: true,
          } 
        }
      );

      this.logger.log(`Contract ${envelope.contractId} signed via DocuSign`);

    } else if (status === 'declined') {
      envelope.status = EnvelopeStatus.DECLINED;
      envelope.declinedAt = new Date();
      envelope.declineReason = payload?.declineReason;

      await this.contractModel.updateOne(
        { id: envelope.contractId },
        { $set: { status: 'rejected' } }
      );

    } else if (status === 'delivered') {
      envelope.status = EnvelopeStatus.DELIVERED;
      envelope.deliveredAt = new Date();

    } else if (status === 'voided') {
      envelope.status = EnvelopeStatus.VOIDED;
    }

    await envelope.save();

    return { ok: true, envelopeId, status: envelope.status };
  }

  /**
   * Mark envelope as signed (for mock/fallback flow)
   */
  async markAsSigned(envelopeId: string): Promise<ContractEnvelope> {
    const envelope = await this.envelopeModel.findOne({ envelopeId });
    if (!envelope) {
      throw new NotFoundException('Envelope not found');
    }

    envelope.status = EnvelopeStatus.COMPLETED;
    envelope.completedAt = new Date();
    await envelope.save();

    // Update contract
    await this.contractModel.updateOne(
      { id: envelope.contractId },
      { 
        $set: { 
          status: 'signed', 
          signedAt: new Date(),
          hasSignedContract: true,
        } 
      }
    );

    this.logger.log(`Envelope ${envelopeId} marked as signed`);

    return envelope;
  }

  /**
   * Create envelope from DocuSign template
   */
  async createEnvelopeFromTemplate(input: {
    templateId: string;
    signers: Array<{ email: string; name: string; roleName: string }>;
    subject?: string;
    message?: string;
    contractId?: string;
    userId?: string;
    dealId?: string;
  }): Promise<any> {
    const clientUserId = randomUUID();

    // Create envelope record if contractId provided
    let envelope: ContractEnvelopeDocument | null = null;
    if (input.contractId) {
      envelope = new this.envelopeModel({
        id: generateId(),
        contractId: input.contractId,
        userId: input.userId,
        dealId: input.dealId,
        email: input.signers[0]?.email,
        fullName: input.signers[0]?.name,
        clientUserId,
        status: EnvelopeStatus.DRAFT,
      });
    }

    // Mock mode
    if (!this.authService.isConfigured()) {
      this.logger.warn('DocuSign not configured - using mock envelope from template');
      const mockEnvelopeId = `mock_tpl_${generateId()}`;
      
      if (envelope) {
        envelope.envelopeId = mockEnvelopeId;
        envelope.status = EnvelopeStatus.SENT;
        envelope.sentAt = new Date();
        await envelope.save();
      }

      return {
        envelopeId: mockEnvelopeId,
        status: 'sent',
        templateId: input.templateId,
        mode: 'mock'
      };
    }

    try {
      const apiClient = await this.authService.getApiClient();
      if (!apiClient) {
        throw new Error('Failed to get DocuSign API client');
      }

      const docusign = await import('docusign-esign');
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      // Build template roles
      const templateRoles = input.signers.map((signer, idx) => 
        docusign.TemplateRole.constructFromObject({
          email: signer.email,
          name: signer.name,
          roleName: signer.roleName,
          clientUserId: `${clientUserId}-${idx}`,
          recipientId: String(idx + 1),
        })
      );

      // Create envelope definition
      const envelopeDefinition = docusign.EnvelopeDefinition.constructFromObject({
        templateId: input.templateId,
        templateRoles,
        status: 'sent',
        emailSubject: input.subject || 'BIBI Cars - Будь ласка, підпишіть договір',
        emailBlurb: input.message || 'Вам надіслано документ на підпис.',
      });

      // Create envelope
      const result = await envelopesApi.createEnvelope(
        this.authService.getAccountId(),
        { envelopeDefinition },
      );

      if (envelope) {
        envelope.envelopeId = result.envelopeId;
        envelope.status = EnvelopeStatus.SENT;
        envelope.sentAt = new Date();
        await envelope.save();

        // Update contract
        if (input.contractId) {
          await this.contractModel.updateOne(
            { id: input.contractId },
            { $set: { envelopeId: result.envelopeId, status: 'sent', sentAt: new Date() } }
          );
        }
      }

      this.logger.log(`Envelope created from template: ${result.envelopeId}`);

      return {
        envelopeId: result.envelopeId,
        status: result.status,
        uri: result.uri,
        templateId: input.templateId,
        mode: 'production'
      };
    } catch (error) {
      this.logger.error(`Failed to create envelope from template: ${error.message}`);
      
      if (envelope) {
        envelope.status = EnvelopeStatus.ERROR;
        envelope.meta = { error: error.message };
        await envelope.save();
      }
      
      throw error;
    }
  }

  /**
   * Get user's envelopes
   */
  async getUserEnvelopes(userId: string): Promise<ContractEnvelope[]> {
    return this.envelopeModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  /**
   * Check if DocuSign is configured
   */
  getConfigStatus(): { configured: boolean; mode: string } {
    return {
      configured: this.authService.isConfigured(),
      mode: this.authService.isConfigured() ? 'production' : 'mock',
    };
  }
}
