/**
 * Payments Service
 * 
 * Universal Invoice Engine
 * 
 * Features:
 * - Invoice creation with step blocking
 * - Stripe checkout integration
 * - Webhook processing
 * - Overdue detection and reminders
 * - Payment flow integration
 */

import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { Invoice, InvoiceStatus, InvoiceType } from './invoice.schema';
import { PaymentFlowService } from '../payment-flow/payment-flow.service';
import { generateId, toObjectResponse } from '../../shared/utils';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';

// Invoice type to step key mapping
const TYPE_TO_STEP: Record<InvoiceType, string> = {
  [InvoiceType.DEPOSIT]: 'deposit_paid',
  [InvoiceType.LOT_PAYMENT]: 'lot_paid',
  [InvoiceType.AUCTION_FEE]: 'auction_fee_paid',
  [InvoiceType.LOGISTICS]: 'logistics_paid',
  [InvoiceType.CUSTOMS]: 'customs_paid',
  [InvoiceType.DELIVERY]: 'delivery_paid',
  [InvoiceType.SERVICE_FEE]: 'service_fee_paid',
  [InvoiceType.OTHER]: 'other',
};

export interface CreateInvoiceDto {
  dealId: string;
  userId: string;
  managerId: string;
  shipmentId?: string;
  type: InvoiceType;
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  dueDate?: Date;
  requiredForNextStep?: boolean;
  metadata?: Record<string, any>;
  customerName?: string;
  customerEmail?: string;
}

export interface CreateCheckoutDto {
  invoiceId: string;
  originUrl: string;
}

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe | null = null;

  constructor(
    private configService: ConfigService,
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @Inject(forwardRef(() => PaymentFlowService))
    private paymentFlowService: PaymentFlowService,
    @Inject(forwardRef(() => IntegrationConfigService))
    private integrationConfigService: IntegrationConfigService,
  ) {}

  async onModuleInit() {
    await this.initializeStripe();
  }

  /**
   * Initialize Stripe with credentials from DB or fallback to env
   */
  private async initializeStripe(): Promise<void> {
    try {
      const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.STRIPE);
      const apiKey = credentials?.secretKey 
        || this.configService.get<string>('STRIPE_API_KEY') 
        || this.configService.get<string>('STRIPE_SECRET_KEY');
      
      if (apiKey && apiKey.length > 10) {
        this.stripe = new Stripe(apiKey, { apiVersion: '2025-02-24.acacia' as any });
        this.logger.log('Stripe initialized with credentials from DB/env');
      } else {
        this.logger.warn('Stripe not configured - payments will be simulated');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize Stripe: ${error.message}`);
    }
  }

  /**
   * Get Stripe instance, re-initialize if needed
   */
  private async getStripe(): Promise<Stripe | null> {
    if (!this.stripe) {
      await this.initializeStripe();
    }
    return this.stripe;
  }

  // === CREATE INVOICE ===
  
  async createInvoice(dto: CreateInvoiceDto): Promise<any> {
    // Validate amount
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check if invoice creation is allowed (contract must be signed)
    await this.paymentFlowService.assertCanCreateInvoice(dto.dealId);

    const stepKey = TYPE_TO_STEP[dto.type] || dto.type;

    const invoice = new this.invoiceModel({
      id: generateId(),
      ...dto,
      currency: dto.currency || 'USD',
      status: InvoiceStatus.DRAFT,
      stepKey,
      requiredForNextStep: dto.requiredForNextStep !== false,
      dueDate: dto.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
    });

    await invoice.save();

    // Notify payment flow about new invoice
    await this.paymentFlowService.onInvoiceCreated(dto.dealId, invoice.id, dto.amount);

    this.logger.log(`Invoice created: ${invoice.id} for ${dto.amount} ${invoice.currency}`);

    return toObjectResponse(invoice.toObject());
  }

  // === SEND INVOICE ===
  
  async sendInvoice(invoiceId: string): Promise<any> {
    const invoice = await this.invoiceModel.findOne({ id: invoiceId });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be sent');
    }

    invoice.status = InvoiceStatus.SENT;
    invoice.sentAt = new Date();
    await invoice.save();

    this.logger.log(`Invoice sent: ${invoiceId}`);

    // TODO: Send email notification to customer

    return toObjectResponse(invoice.toObject());
  }

  // === CANCEL INVOICE ===
  
  async cancelInvoice(invoiceId: string): Promise<any> {
    const invoice = await this.invoiceModel.findOne({ id: invoiceId });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot cancel paid invoice');
    }

    invoice.status = InvoiceStatus.CANCELLED;
    invoice.cancelledAt = new Date();
    await invoice.save();

    this.logger.log(`Invoice cancelled: ${invoiceId}`);

    return toObjectResponse(invoice.toObject());
  }

  // === CREATE CHECKOUT SESSION ===
  
  async createCheckoutSession(dto: CreateCheckoutDto): Promise<{ url: string; sessionId: string }> {
    const stripe = await this.getStripe();
    if (!stripe) {
      throw new BadRequestException('Stripe not configured. Please configure Stripe in Admin > Integrations');
    }

    const invoice = await this.invoiceModel.findOne({ id: dto.invoiceId });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice already paid');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is cancelled');
    }

    // Update status to pending if draft/sent
    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.SENT) {
      invoice.status = InvoiceStatus.PENDING;
    }

    // Build URLs dynamically
    const successUrl = `${dto.originUrl}/cabinet/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${dto.originUrl}/cabinet/invoices`;

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: (invoice.currency || 'usd').toLowerCase(),
              product_data: {
                name: invoice.title || `Invoice #${invoice.id}`,
                description: invoice.description,
              },
              unit_amount: Math.round(invoice.amount * 100), // Stripe uses cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          invoiceId: invoice.id,
          dealId: invoice.dealId,
          userId: invoice.userId,
          type: invoice.type,
          stepKey: invoice.stepKey,
        },
        customer_email: invoice.customerEmail,
      });

      // Update invoice with Stripe session
      invoice.stripeSessionId = session.id;
      invoice.stripeCheckoutUrl = session.url || '';
      await invoice.save();

      this.logger.log(`Checkout session created: ${session.id} for invoice ${invoice.id}`);

      return {
        url: session.url || '',
        sessionId: session.id,
      };
    } catch (error) {
      this.logger.error(`Stripe error: ${error.message}`);
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  // === HANDLE WEBHOOK ===
  
  async handleWebhook(body: Buffer, signature: string): Promise<any> {
    const stripe = await this.getStripe();
    if (!stripe) {
      throw new BadRequestException('Stripe not configured');
    }

    // Get webhook secret from IntegrationConfig (DB) with .env fallback
    let webhookSecret: string | undefined;
    try {
      const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.STRIPE);
      webhookSecret = credentials?.webhookSecret || this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    } catch {
      webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    }
    
    let event: Stripe.Event;

    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } else {
        // SECURITY: Without webhook secret, reject the request in production
        this.logger.warn('Stripe webhook secret not configured - SECURITY RISK');
        throw new BadRequestException('Webhook secret not configured');
      }
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;
    }

    return { received: true };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) {
      this.logger.warn('Checkout completed without invoiceId');
      return;
    }

    const invoice = await this.invoiceModel.findOne({ id: invoiceId });
    if (!invoice) {
      this.logger.warn(`Invoice not found: ${invoiceId}`);
      return;
    }

    // Prevent duplicate processing
    if (invoice.status === InvoiceStatus.PAID) {
      this.logger.log(`Invoice ${invoiceId} already paid, skipping`);
      return;
    }

    // Mark as paid
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    invoice.stripePaymentIntentId = session.payment_intent as string;
    await invoice.save();

    // Update payment flow
    await this.paymentFlowService.onInvoicePaid(
      invoice.dealId,
      invoice.type,
      invoice.id,
      invoice.amount
    );

    // Update deal if connected
    if (invoice.dealId) {
      await this.dealModel.updateOne(
        { id: invoice.dealId },
        { 
          $set: { lastPaymentAt: new Date() },
          $push: { paidInvoices: invoice.id },
        }
      );
    }

    this.logger.log(`Invoice ${invoiceId} marked as PAID`);
  }

  private async handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) return;

    await this.invoiceModel.updateOne(
      { id: invoiceId, status: { $ne: InvoiceStatus.PAID } },
      { $set: { status: InvoiceStatus.EXPIRED } }
    );

    this.logger.log(`Invoice ${invoiceId} marked as EXPIRED`);
  }

  // === MARK AS PAID (MANUAL) ===
  
  async markAsPaid(invoiceId: string, managerId: string): Promise<any> {
    const invoice = await this.invoiceModel.findOne({ id: invoiceId });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice already paid');
    }

    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    invoice.metadata = {
      ...invoice.metadata,
      manuallyMarkedPaid: true,
      markedPaidBy: managerId,
    };
    await invoice.save();

    // Update payment flow
    await this.paymentFlowService.onInvoicePaid(
      invoice.dealId,
      invoice.type,
      invoice.id,
      invoice.amount
    );

    this.logger.log(`Invoice ${invoiceId} manually marked as PAID by ${managerId}`);

    return toObjectResponse(invoice.toObject());
  }

  // === GET CHECKOUT STATUS ===
  
  async getCheckoutStatus(sessionId: string): Promise<any> {
    const stripe = await this.getStripe();
    if (!stripe) {
      throw new BadRequestException('Stripe not configured');
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      // Update invoice if paid
      if (session.payment_status === 'paid' && session.metadata?.invoiceId) {
        const invoice = await this.invoiceModel.findOne({ id: session.metadata.invoiceId });
        if (invoice && invoice.status !== InvoiceStatus.PAID) {
          invoice.status = InvoiceStatus.PAID;
          invoice.paidAt = new Date();
          invoice.stripePaymentIntentId = session.payment_intent as string;
          await invoice.save();

          // Update payment flow
          await this.paymentFlowService.onInvoicePaid(
            invoice.dealId,
            invoice.type,
            invoice.id,
            invoice.amount
          );
        }
      }

      return {
        status: session.status,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
      };
    } catch (error) {
      this.logger.error(`Error getting checkout status: ${error.message}`);
      throw new BadRequestException('Failed to get checkout status');
    }
  }

  // === GET INVOICE ===
  
  async getInvoice(invoiceId: string): Promise<any> {
    const invoice = await this.invoiceModel.findOne({ id: invoiceId }).lean();
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return toObjectResponse(invoice);
  }

  // === GET USER INVOICES ===
  
  async getUserInvoices(userId: string): Promise<any[]> {
    const invoices = await this.invoiceModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    
    return invoices.map(i => toObjectResponse(i));
  }

  // === GET DEAL INVOICES ===
  
  async getDealInvoices(dealId: string): Promise<any[]> {
    const invoices = await this.invoiceModel.find({ dealId })
      .sort({ createdAt: -1 })
      .lean();
    
    return invoices.map(i => toObjectResponse(i));
  }

  // === GET MANAGER INVOICES ===
  
  async getManagerInvoices(managerId: string, status?: InvoiceStatus): Promise<any[]> {
    const filter: any = { managerId };
    if (status) filter.status = status;
    
    const invoices = await this.invoiceModel.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    
    return invoices.map(i => toObjectResponse(i));
  }

  // === GET ALL INVOICES (ADMIN) ===
  
  async getAdminInvoices(filters?: {
    status?: InvoiceStatus;
    type?: InvoiceType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]> {
    const query: any = {};
    
    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;
    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const invoices = await this.invoiceModel.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    return invoices.map(i => toObjectResponse(i));
  }

  // === GET OVERDUE INVOICES ===
  
  async getOverdueInvoices(): Promise<any[]> {
    const now = new Date();
    const invoices = await this.invoiceModel.find({
      status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PENDING] },
      dueDate: { $lt: now },
    })
      .sort({ dueDate: 1 })
      .lean();
    
    return invoices.map(i => toObjectResponse(i));
  }

  // === CHECK AND MARK OVERDUE ===
  
  async checkAndMarkOverdue(): Promise<number> {
    const now = new Date();
    const result = await this.invoiceModel.updateMany(
      {
        status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PENDING] },
        dueDate: { $lt: now },
      },
      { $set: { status: InvoiceStatus.OVERDUE } }
    );

    // Notify payment flow for each overdue invoice
    const overdueInvoices = await this.invoiceModel.find({ status: InvoiceStatus.OVERDUE });
    for (const invoice of overdueInvoices) {
      await this.paymentFlowService.onInvoiceOverdue(invoice.dealId, invoice.id, invoice.amount);
    }

    this.logger.log(`Marked ${result.modifiedCount} invoices as overdue`);
    return result.modifiedCount;
  }

  // === GET ANALYTICS ===
  
  async getAnalytics(periodDays: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [total, byStatus, byType, totalPaid, totalOverdue] = await Promise.all([
      this.invoiceModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.invoiceModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$type', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { status: InvoiceStatus.PAID, paidAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { status: InvoiceStatus.OVERDUE } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, s) => ({ 
        ...acc, 
        [s._id]: { count: s.count, amount: s.amount } 
      }), {}),
      byType: byType.reduce((acc, t) => ({ 
        ...acc, 
        [t._id]: { count: t.count, amount: t.amount } 
      }), {}),
      totalPaid: totalPaid[0]?.total || 0,
      totalOverdue: totalOverdue[0]?.total || 0,
      periodDays,
    };
  }

  // === CHECK IF STEP IS BLOCKED ===
  
  async isStepBlocked(dealId: string, requiredType: InvoiceType): Promise<boolean> {
    const paidInvoice = await this.invoiceModel.findOne({
      dealId,
      type: requiredType,
      status: InvoiceStatus.PAID,
    });

    return !paidInvoice;
  }
}
