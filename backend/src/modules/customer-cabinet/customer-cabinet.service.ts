import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toObjectResponse, toArrayResponse } from '../../shared/utils';
import { HistoryReport, ReportStatus } from '../history-reports/history-report.schema';

/**
 * Customer Cabinet Service
 * 
 * Client Process Center - повний огляд процесу для клієнта
 * 
 * API поверх існуючих entities:
 * - Customer
 * - Lead  
 * - Quote
 * - Deal
 * - Deposit
 * - CustomerTimelineEvent
 * - Notification
 */

// Deal status pipeline для Process Stepper
const DEAL_PROCESS_STEPS = [
  { code: 'new', label: 'Заявка створена', icon: 'file' },
  { code: 'negotiation', label: 'Узгодження', icon: 'chat' },
  { code: 'waiting_deposit', label: 'Очікується депозит', icon: 'wallet' },
  { code: 'deposit_paid', label: 'Депозит внесено', icon: 'check' },
  { code: 'purchased', label: 'Авто куплено', icon: 'car' },
  { code: 'in_delivery', label: 'В доставці', icon: 'truck' },
  { code: 'completed', label: 'Завершено', icon: 'flag' },
];

@Injectable()
export class CustomerCabinetService {
  private readonly logger = new Logger(CustomerCabinetService.name);

  constructor(
    @InjectModel('Customer') private customerModel: Model<any>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Quote') private quoteModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Deposit') private depositModel: Model<any>,
    @InjectModel('CustomerTimelineEvent') private timelineModel: Model<any>,
    @InjectModel('Notification') private notificationModel: Model<any>,
    @InjectModel('HistoryReport') private historyReportModel: Model<HistoryReport>,
  ) {}

  // ============ DASHBOARD ============
  async getDashboard(customerId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    const [activeLeads, activeDeals, latestTimeline, pendingDeposits, recentQuotes] = await Promise.all([
      // Active leads (not converted)
      this.leadModel.find({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: { $ne: true },
        status: { $nin: ['converted', 'lost', 'won'] },
      }).sort({ createdAt: -1 }).limit(5).lean(),

      // Active deals (not completed/cancelled)
      this.dealModel.find({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
        status: { $nin: ['completed', 'cancelled'] },
      }).sort({ createdAt: -1 }).limit(5).lean(),

      // Latest timeline events
      this.timelineModel.find({
        customerId: { $in: [mongoId, customId] },
      }).sort({ createdAt: -1 }).limit(10).lean(),

      // Pending deposits
      this.depositModel.find({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
        status: { $in: ['pending', 'waiting_confirmation'] },
      }).sort({ createdAt: -1 }).limit(5).lean(),

      // Recent quotes
      this.quoteModel.find({
        $or: [{ customerId: mongoId }, { customerId: customId }],
      }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);

    // Get total counts
    const [totalLeads, totalDeals, totalDeposits, completedDeals] = await Promise.all([
      this.leadModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: { $ne: true },
      }),
      this.dealModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
      }),
      this.depositModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
      }),
      this.dealModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
        status: 'completed',
      }),
    ]);

    // Calculate financial summary
    const allDeals = await this.dealModel.find({
      $or: [{ customerId: mongoId }, { customerId: customId }],
      isDeleted: false,
    }).lean();

    const totalValue = allDeals.reduce((sum: number, d: any) => sum + (d.clientPrice || 0), 0);
    const activeValue = activeDeals.reduce((sum: number, d: any) => sum + (d.clientPrice || 0), 0);

    // Find next action (most urgent deal)
    const nextAction = this.getNextAction(activeDeals, pendingDeposits);

    return {
      customer: toObjectResponse(customer),
      summary: {
        totalLeads,
        totalDeals,
        totalDeposits,
        completedDeals,
        activeLeads: activeLeads.length,
        activeDeals: activeDeals.length,
        pendingDeposits: pendingDeposits.length,
        totalValue,
        activeValue,
      },
      activeLeads: toArrayResponse(activeLeads),
      activeDeals: toArrayResponse(activeDeals),
      pendingDeposits: toArrayResponse(pendingDeposits),
      recentQuotes: toArrayResponse(recentQuotes),
      latestTimeline: toArrayResponse(latestTimeline),
      nextAction,
      manager: customer.managerId ? await this.getManagerInfo(customer.managerId) : null,
    };
  }

  // ============ MY REQUESTS (LEADS) ============
  async getRequests(customerId: string, query?: { status?: string; page?: number; limit?: number }): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    const { status, page = 1, limit = 20 } = query || {};

    const filter: any = {
      $or: [{ customerId: mongoId }, { customerId: customId }],
      isDeleted: { $ne: true },
    };

    if (status) filter.status = status;

    const [leads, total] = await Promise.all([
      this.leadModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.leadModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(leads),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ============ MY ORDERS (DEALS) ============
  async getOrders(customerId: string, query?: { status?: string; page?: number; limit?: number }): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    const { status, page = 1, limit = 20 } = query || {};

    const filter: any = {
      $or: [{ customerId: mongoId }, { customerId: customId }],
      isDeleted: false,
    };

    if (status) filter.status = status;

    const [deals, total] = await Promise.all([
      this.dealModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.dealModel.countDocuments(filter),
    ]);

    // Add process state to each deal
    const dealsWithProcess = deals.map((deal: any) => ({
      ...toObjectResponse(deal),
      processState: this.buildProcessState(deal.status),
    }));

    return {
      data: dealsWithProcess,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ============ ORDER DETAILS ============
  async getOrderDetails(customerId: string, dealId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    // Find deal - first by custom id
    let deal: any = await this.dealModel.findOne({
      id: dealId,
      customerId: { $in: [mongoId, customId] },
      isDeleted: false,
    }).lean();

    // If not found and looks like ObjectId, try by _id
    if (!deal && /^[a-f\d]{24}$/i.test(dealId)) {
      deal = await this.dealModel.findOne({
        _id: dealId,
        customerId: { $in: [mongoId, customId] },
        isDeleted: false,
      }).lean();
    }

    if (!deal) throw new NotFoundException('Order not found');

    const dealIdStr = deal.id || String(deal._id);
    const dealMongoId = String(deal._id);

    // Get related data
    const [deposits, timeline, quote, lead] = await Promise.all([
      // Deposits for this deal
      this.depositModel.find({
        dealId: { $in: [dealIdStr, dealMongoId] },
        isDeleted: false,
      }).sort({ createdAt: -1 }).lean(),

      // Timeline events for this deal
      this.timelineModel.find({
        customerId: { $in: [mongoId, customId] },
        entityType: 'deal',
        entityId: { $in: [dealIdStr, dealMongoId] },
      }).sort({ createdAt: -1 }).lean(),

      // Quote if exists - use id field only
      deal.quoteId 
        ? this.quoteModel.findOne({ id: deal.quoteId }).lean()
        : null,

      // Lead if exists - use id field only
      deal.leadId
        ? this.leadModel.findOne({ id: deal.leadId }).lean()
        : null,
    ]);

    // Calculate deposit summary
    const depositSummary = {
      total: deposits.length,
      totalAmount: deposits.reduce((sum: number, d: any) => sum + (d.amount || 0), 0),
      confirmed: deposits.filter((d: any) => d.status === 'confirmed' || d.status === 'completed').length,
      confirmedAmount: deposits
        .filter((d: any) => d.status === 'confirmed' || d.status === 'completed')
        .reduce((sum: number, d: any) => sum + (d.amount || 0), 0),
      pending: deposits.filter((d: any) => d.status === 'pending').length,
    };

    // Build process state
    const processState = this.buildProcessState((deal as any).status);

    // What's next info
    const whatsNext = this.getWhatsNext((deal as any).status, depositSummary);

    return {
      deal: toObjectResponse(deal),
      deposits: toArrayResponse(deposits),
      depositSummary,
      timeline: toArrayResponse(timeline),
      quote: quote ? toObjectResponse(quote) : null,
      lead: lead ? toObjectResponse(lead) : null,
      processState,
      whatsNext,
      manager: (deal as any).managerId ? await this.getManagerInfo((deal as any).managerId) : null,
    };
  }

  // ============ MY DEPOSITS ============
  async getDeposits(customerId: string, query?: { status?: string; page?: number; limit?: number }): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    const { status, page = 1, limit = 20 } = query || {};

    const filter: any = {
      $or: [{ customerId: mongoId }, { customerId: customId }],
      isDeleted: false,
    };

    if (status) filter.status = status;

    const [deposits, total] = await Promise.all([
      this.depositModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.depositModel.countDocuments(filter),
    ]);

    // Add deal info to each deposit
    const depositsWithDeals = await Promise.all(
      deposits.map(async (deposit: any) => {
        let dealInfo: any = null;
        if (deposit.dealId) {
          // First try by custom id field
          let deal: any = await this.dealModel.findOne({
            id: deposit.dealId,
          }).lean();
          
          // If not found and looks like ObjectId, try by _id
          if (!deal && /^[a-f\d]{24}$/i.test(deposit.dealId)) {
            deal = await this.dealModel.findOne({
              _id: deposit.dealId,
            }).lean();
          }
          if (deal) {
            dealInfo = {
              id: deal.id || String(deal._id),
              vin: deal.vin,
              title: deal.title || deal.vehicleTitle,
              status: deal.status,
            };
          }
        }
        return {
          ...toObjectResponse(deposit),
          dealInfo,
        };
      }),
    );

    // Summary
    const summary = {
      total: deposits.length,
      totalAmount: deposits.reduce((sum: number, d: any) => sum + (d.amount || 0), 0),
      confirmed: deposits.filter((d: any) => d.status === 'confirmed' || d.status === 'completed').length,
      pending: deposits.filter((d: any) => d.status === 'pending').length,
    };

    return {
      data: depositsWithDeals,
      summary,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ============ TIMELINE ============
  async getTimeline(customerId: string, query?: { page?: number; limit?: number; type?: string }): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    const { page = 1, limit = 50, type } = query || {};

    const filter: any = {
      customerId: { $in: [mongoId, customId] },
    };

    if (type) filter.type = type;

    const [events, total] = await Promise.all([
      this.timelineModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.timelineModel.countDocuments(filter),
    ]);

    // Group by date
    const grouped = this.groupTimelineByDate(events);

    return {
      data: toArrayResponse(events),
      grouped,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ============ PROFILE ============
  async getProfile(customerId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    
    // Get summary stats
    const mongoId = String(customer._id);
    const customId = customer.id;

    const [totalLeads, totalDeals, totalDeposits, completedDeals] = await Promise.all([
      this.leadModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: { $ne: true },
      }),
      this.dealModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
      }),
      this.depositModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
      }),
      this.dealModel.countDocuments({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
        status: 'completed',
      }),
    ]);

    return {
      customer: toObjectResponse(customer),
      stats: {
        totalLeads,
        totalDeals,
        totalDeposits,
        completedDeals,
        memberSince: customer.createdAt,
        lastActivity: customer.lastInteractionAt,
      },
      manager: customer.managerId ? await this.getManagerInfo(customer.managerId) : null,
    };
  }

  // ============ NOTIFICATIONS ============
  async getNotifications(customerId: string, query?: { unreadOnly?: boolean; limit?: number }): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    const { unreadOnly = false, limit = 50 } = query || {};

    const filter: any = {
      customerId: { $in: [mongoId, customId] },
    };

    if (unreadOnly) filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({
        customerId: { $in: [mongoId, customId] },
        isRead: false,
      }),
    ]);

    return {
      data: toArrayResponse(notifications),
      meta: { total, unreadCount, limit },
    };
  }

  async markNotificationAsRead(customerId: string, notificationId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    const result = await this.notificationModel.updateOne(
      {
        id: notificationId,
        customerId: { $in: [mongoId, customId] },
      },
      { $set: { isRead: true, readAt: new Date() } },
    );

    return { success: result.modifiedCount > 0 };
  }

  // ============ HELPER METHODS ============
  
  private async getCustomerByIdOrThrow(customerId: string): Promise<any> {
    // First try by custom id field
    let customer = await this.customerModel.findOne({
      id: customerId,
      isDeleted: false,
    }).lean();

    // If not found and looks like ObjectId, try by _id
    if (!customer && /^[a-f\d]{24}$/i.test(customerId)) {
      customer = await this.customerModel.findOne({
        _id: customerId,
        isDeleted: false,
      }).lean();
    }

    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private buildProcessState(status: string): any[] {
    const currentIndex = DEAL_PROCESS_STEPS.findIndex(s => s.code === status);
    
    return DEAL_PROCESS_STEPS.map((step, index) => ({
      ...step,
      completed: currentIndex > index,
      current: currentIndex === index,
      upcoming: currentIndex < index,
    }));
  }

  private getNextAction(activeDeals: any[], pendingDeposits: any[]): any {
    // Check pending deposits first
    if (pendingDeposits.length > 0) {
      return {
        type: 'deposit_required',
        title: 'Потрібно внести депозит',
        description: `У вас ${pendingDeposits.length} депозит(ів) очікує оплати`,
        urgency: 'high',
      };
    }

    // Check deals waiting for deposit
    const waitingDeposit = activeDeals.find((d: any) => d.status === 'waiting_deposit');
    if (waitingDeposit) {
      return {
        type: 'deposit_expected',
        title: 'Очікується депозит',
        description: `Для продовження процесу по VIN ${waitingDeposit.vin || '—'} потрібен депозит`,
        dealId: waitingDeposit.id || waitingDeposit._id,
        urgency: 'high',
      };
    }

    // Check deals in delivery
    const inDelivery = activeDeals.filter((d: any) => d.status === 'in_delivery');
    if (inDelivery.length > 0) {
      return {
        type: 'in_delivery',
        title: 'Авто в доставці',
        description: `${inDelivery.length} авто в процесі доставки`,
        urgency: 'normal',
      };
    }

    // Active negotiations
    const negotiations = activeDeals.filter((d: any) => d.status === 'negotiation');
    if (negotiations.length > 0) {
      return {
        type: 'negotiation',
        title: 'Активні переговори',
        description: `${negotiations.length} угод(и) в процесі узгодження`,
        urgency: 'normal',
      };
    }

    return null;
  }

  private getWhatsNext(status: string, depositSummary: any): any {
    switch (status) {
      case 'new':
        return {
          title: 'Що далі?',
          description: 'Ваш менеджер зв\'яжеться з вами для обговорення деталей замовлення.',
          steps: ['Узгодження ціни', 'Вибір авто', 'Внесення депозиту'],
        };
      case 'negotiation':
        return {
          title: 'Що далі?',
          description: 'Після узгодження всіх деталей потрібно буде внести депозит.',
          steps: ['Фіналізація ціни', 'Внесення депозиту', 'Покупка на аукціоні'],
        };
      case 'waiting_deposit':
        return {
          title: 'Потрібен депозит',
          description: 'Для продовження процесу внесіть депозит. Це гарантує резервування авто.',
          steps: ['Внесіть депозит', 'Підтвердження менеджером', 'Покупка на аукціоні'],
        };
      case 'deposit_paid':
        return {
          title: 'Депозит внесено!',
          description: 'Ваш депозит підтверджено. Авто буде куплено на найближчому аукціоні.',
          steps: ['Покупка на аукціоні', 'Логістика', 'Доставка'],
        };
      case 'purchased':
        return {
          title: 'Авто куплено!',
          description: 'Авто успішно придбано. Готуємо документи та логістику.',
          steps: ['Оформлення документів', 'Відправка', 'Доставка'],
        };
      case 'in_delivery':
        return {
          title: 'Авто в дорозі',
          description: 'Ваше авто в процесі доставки. Очікуйте оновлення статусу.',
          steps: ['Митне оформлення', 'Доставка до місця', 'Передача клієнту'],
        };
      case 'completed':
        return {
          title: 'Замовлення завершено!',
          description: 'Вітаємо! Ваше авто доставлено. Дякуємо за довіру!',
          steps: [],
        };
      default:
        return null;
    }
  }

  private groupTimelineByDate(events: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    for (const event of events) {
      const date = new Date(event.createdAt).toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(toObjectResponse(event));
    }

    return grouped;
  }

  private async getManagerInfo(managerId: string): Promise<any> {
    // In production, this would fetch from users collection
    // For now, return placeholder
    return {
      id: managerId,
      name: 'Ваш менеджер',
      phone: '+380 XX XXX XXXX',
      email: 'manager@bibi.com',
    };
  }

  // ============ HISTORY REPORTS (VIN Reports) ============
  async getHistoryReports(userId: string): Promise<any[]> {
    // Expire old reports first
    const expireTime = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours
    await this.historyReportModel.updateMany(
      {
        status: ReportStatus.UNLOCKED,
        deliveredAt: { $lt: expireTime },
      },
      {
        $set: { status: ReportStatus.EXPIRED },
      }
    );

    // Get all user reports
    const reports = await this.historyReportModel.find({
      userId,
      status: { 
        $in: [
          ReportStatus.UNLOCKED, 
          ReportStatus.PURCHASED, 
          ReportStatus.EXPIRED, 
          ReportStatus.ARCHIVED,
          ReportStatus.PENDING_APPROVAL,
          ReportStatus.DENIED
        ] 
      },
    }).sort({ createdAt: -1 }).lean();

    return reports.map(r => toObjectResponse(r));
  }

  // ============ CARFAX REPORTS ============
  async getCarfaxReports(customerId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    try {
      // Find carfax reports associated with customer's deals
      const deals = await this.dealModel.find({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
      }).select('vin carfaxReportId carfaxReports').lean();

      const carfaxReports: any[] = [];
      for (const deal of deals) {
        if (deal.carfaxReports && deal.carfaxReports.length > 0) {
          carfaxReports.push(...deal.carfaxReports.map((r: any) => ({
            ...r,
            vin: deal.vin,
            dealId: deal.id || deal._id,
          })));
        }
      }

      // Also check history reports for VIN reports
      const vinReports = await this.historyReportModel.find({
        $or: [
          { userId: customId },
          { customerEmail: customer.email },
        ],
        reportType: 'carfax',
      }).sort({ createdAt: -1 }).lean();

      return {
        data: [
          ...carfaxReports,
          ...vinReports.map(r => toObjectResponse(r)),
        ],
      };
    } catch (error) {
      this.logger.error(`Failed to get carfax reports: ${error.message}`);
      return { data: [] };
    }
  }

  // ============ CONTRACTS ============
  async getContracts(customerId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    try {
      // Get deals with contracts
      const deals = await this.dealModel.find({
        $and: [
          { $or: [{ customerId: mongoId }, { customerId: customId }] },
          { isDeleted: false },
          { $or: [
            { contractId: { $exists: true, $ne: null } },
            { 'contract.id': { $exists: true } },
            { contracts: { $exists: true, $ne: [] } },
          ]},
        ],
      }).select('vin vehicleTitle contractId contract contracts status signatureStatus envelopeId createdAt').lean();

      const contracts = deals.map(deal => ({
        id: deal.contractId || deal.contract?.id || deal._id,
        vin: deal.vin,
        title: deal.vehicleTitle || `Договір на ${deal.vin}`,
        status: deal.signatureStatus || deal.contract?.status || 'draft',
        signedPdfUrl: deal.contract?.signedPdfUrl || null,
        envelopeId: deal.envelopeId,
        createdAt: deal.createdAt,
      }));

      return { data: contracts };
    } catch (error) {
      this.logger.error(`Failed to get contracts: ${error.message}`);
      return { data: [] };
    }
  }

  // ============ INVOICES ============
  async getInvoices(customerId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    try {
      // Get deposits as invoices
      const deposits = await this.depositModel.find({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
      }).sort({ createdAt: -1 }).lean();

      const invoices = deposits.map(dep => ({
        id: dep.id || dep._id,
        amount: dep.amount || 0,
        status: dep.status === 'confirmed' || dep.status === 'completed' ? 'paid' : 'pending',
        description: dep.purpose || dep.type || 'Депозит',
        dealId: dep.dealId,
        createdAt: dep.createdAt,
        paidAt: dep.confirmedAt || dep.completedAt,
      }));

      const paid = invoices.filter(i => i.status === 'paid').length;
      const pending = invoices.filter(i => i.status === 'pending').length;
      const totalAmount = invoices.reduce((sum, i) => sum + (i.amount || 0), 0);

      return {
        data: invoices,
        invoices,
        summary: {
          total: invoices.length,
          paid,
          pending,
          totalAmount,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get invoices: ${error.message}`);
      return { data: [], invoices: [], summary: { total: 0, paid: 0, pending: 0, totalAmount: 0 } };
    }
  }

  // ============ SHIPPING ============
  async getShipping(customerId: string): Promise<any> {
    const customer = await this.getCustomerByIdOrThrow(customerId);
    const mongoId = String(customer._id);
    const customId = customer.id;

    try {
      // Get deals with shipping info
      const deals = await this.dealModel.find({
        $or: [{ customerId: mongoId }, { customerId: customId }],
        isDeleted: false,
        status: { $in: ['purchased', 'in_delivery', 'delivery', 'shipped', 'arrived'] },
      }).select('vin vehicleTitle status shipping shippingInfo containerNumber trackingNumber eta createdAt').lean();

      const shipments = deals.map(deal => ({
        id: deal._id,
        vin: deal.vin,
        title: deal.vehicleTitle,
        containerNumber: deal.containerNumber || deal.shipping?.containerNumber || deal.shippingInfo?.containerNumber,
        trackingNumber: deal.trackingNumber || deal.shipping?.trackingNumber,
        status: deal.shipping?.status || deal.status,
        eta: deal.eta || deal.shipping?.eta || deal.shippingInfo?.eta,
        timeline: deal.shipping?.timeline || deal.shippingInfo?.timeline || [],
        origin: deal.shipping?.origin || 'USA',
        destination: deal.shipping?.destination || 'Ukraine',
        createdAt: deal.createdAt,
      }));

      return { data: shipments };
    } catch (error) {
      this.logger.error(`Failed to get shipping: ${error.message}`);
      return { data: [] };
    }
  }
}
