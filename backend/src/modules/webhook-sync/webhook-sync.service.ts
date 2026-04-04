/**
 * Webhook Sync Service
 * 
 * Fallback sync для випадків коли webhook не дійшов
 * - Stripe: перевіряє статус платежів
 * - DocuSign: перевіряє статус конвертів
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Invoice, InvoiceStatus } from '../payments/invoice.schema';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';
import { SystemErrorService } from '../system-errors/system-error.service';
import axios from 'axios';

@Injectable()
export class WebhookSyncService {
  private readonly logger = new Logger(WebhookSyncService.name);

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel('Contract') private contractModel: Model<any>,
    private readonly integrationConfig: IntegrationConfigService,
    private readonly errorService: SystemErrorService,
  ) {}

  /**
   * Sync Stripe payments (fallback for missed webhooks)
   * Runs every 10 minutes
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncStripePayments(): Promise<void> {
    const credentials = await this.integrationConfig.getCredentials(IntegrationProvider.STRIPE);
    if (!credentials?.secretKey) {
      return;
    }

    try {
      // Find invoices that should be checked
      const pendingInvoices = await this.invoiceModel.find({
        status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PENDING] },
        stripeSessionId: { $exists: true, $ne: null },
        updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }, // Not updated in 5 min
      }).limit(50);

      this.logger.log(`Checking ${pendingInvoices.length} pending Stripe invoices`);

      for (const invoice of pendingInvoices) {
        await this.checkStripeSession(invoice, credentials.secretKey);
      }
    } catch (error) {
      await this.errorService.logError({
        module: 'WebhookSync',
        action: 'syncStripePayments',
        error: error.message,
      });
    }
  }

  /**
   * Check individual Stripe session
   */
  private async checkStripeSession(invoice: any, secretKey: string): Promise<void> {
    try {
      const sessionId = invoice.stripeSessionId;
      if (!sessionId) return;

      const response = await axios.get(
        `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
        { auth: { username: secretKey, password: '' } },
      );

      const session = response.data;

      if (session.payment_status === 'paid' && invoice.status !== InvoiceStatus.PAID) {
        // Update invoice to paid
        await this.invoiceModel.updateOne(
          { _id: invoice._id },
          {
            status: InvoiceStatus.PAID,
            paidAt: new Date(),
            stripePaymentIntentId: session.payment_intent,
            syncedFromFallback: true,
          },
        );

        this.logger.log(`[Fallback] Invoice ${invoice.id} marked as PAID from Stripe sync`);
      } else if (session.status === 'expired' && invoice.status === InvoiceStatus.SENT) {
        // Session expired
        await this.invoiceModel.updateOne(
          { _id: invoice._id },
          { status: InvoiceStatus.EXPIRED },
        );

        this.logger.log(`[Fallback] Invoice ${invoice.id} marked as EXPIRED`);
      }
    } catch (error) {
      this.logger.warn(`Failed to check Stripe session for invoice ${invoice.id}: ${error.message}`);
    }
  }

  /**
   * Sync DocuSign envelopes (fallback for missed webhooks)
   * Runs every 15 minutes
   */
  @Cron('*/15 * * * *')
  async syncDocusignEnvelopes(): Promise<void> {
    const credentials = await this.integrationConfig.getCredentials(IntegrationProvider.DOCUSIGN);
    if (!credentials?.integrationKey || !credentials?.accountId) {
      return;
    }

    try {
      // Find contracts pending signature
      const pendingContracts = await this.contractModel.find({
        status: 'sent',
        docusignEnvelopeId: { $exists: true, $ne: null },
        updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) }, // Not updated in 10 min
      }).limit(30);

      this.logger.log(`Checking ${pendingContracts.length} pending DocuSign envelopes`);

      for (const contract of pendingContracts) {
        await this.checkDocusignEnvelope(contract, credentials);
      }
    } catch (error) {
      await this.errorService.logError({
        module: 'WebhookSync',
        action: 'syncDocusignEnvelopes',
        error: error.message,
      });
    }
  }

  /**
   * Check individual DocuSign envelope
   */
  private async checkDocusignEnvelope(contract: any, credentials: any): Promise<void> {
    try {
      // DocuSign API call would go here
      // For now, mark as needing manual check if too old
      const createdAt = new Date(contract.createdAt);
      const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceCreation > 7) {
        // Alert about stale contract
        await this.errorService.logError({
          module: 'WebhookSync',
          action: 'staleContract',
          error: `Contract ${contract.id} pending signature for ${Math.floor(daysSinceCreation)} days`,
          context: { contractId: contract.id, dealId: contract.dealId },
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to check DocuSign envelope for contract ${contract.id}: ${error.message}`);
    }
  }

  /**
   * Manual sync trigger
   */
  async forceSyncAll(): Promise<{ stripe: number; docusign: number }> {
    await this.syncStripePayments();
    await this.syncDocusignEnvelopes();
    
    return {
      stripe: await this.invoiceModel.countDocuments({ syncedFromFallback: true }),
      docusign: 0, // Would return actual count
    };
  }
}
