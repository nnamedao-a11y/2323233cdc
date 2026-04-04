/**
 * Contracts Service
 * 
 * Handles contract creation, sending, and e-signature tracking
 * 
 * NOTE: This uses a simple internal signing flow.
 * For production DocuSign integration, implement DocuSign API calls.
 */

import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Contract, ContractStatus, ContractType } from './contract.schema';
import { ContractEmailService } from './contract-email.service';
import { generateId, toObjectResponse } from '../../shared/utils';

export interface CreateContractDto {
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  dealId?: string;
  leadId?: string;
  type: ContractType;
  title: string;
  description?: string;
  vin?: string;
  vehicleTitle?: string;
  price?: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private configService: ConfigService,
    @InjectModel(Contract.name) private contractModel: Model<Contract>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Invoice') private invoiceModel: Model<any>,
    @Inject(forwardRef(() => ContractEmailService))
    private emailService: ContractEmailService,
  ) {}

  // === CREATE CONTRACT ===
  
  async createContract(dto: CreateContractDto, createdBy?: string): Promise<Contract> {
    const contract = new this.contractModel({
      id: generateId(),
      ...dto,
      status: ContractStatus.DRAFT,
      createdBy,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await contract.save();
    this.logger.log(`Contract created: ${contract.id} (${dto.type})`);

    return contract;
  }

  // === SEND CONTRACT FOR SIGNING ===
  
  async sendContract(contractId: string, originUrl: string): Promise<{ signingUrl: string }> {
    const contract = await this.contractModel.findOne({ id: contractId });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    if (contract.status === ContractStatus.SIGNED) {
      throw new BadRequestException('Contract already signed');
    }

    // Generate signing URL (internal flow)
    // In production: use DocuSign API to create envelope
    const signingToken = Buffer.from(`${contract.id}:${Date.now()}`).toString('base64');
    const signingUrl = `${originUrl}/sign/${signingToken}`;

    contract.status = ContractStatus.SENT;
    contract.sentAt = new Date();
    contract.signingUrl = signingUrl;
    contract.envelopeId = `env_${contract.id}`;
    await contract.save();

    this.logger.log(`Contract sent: ${contract.id}`);

    return { signingUrl };
  }

  // === MARK CONTRACT AS VIEWED ===
  
  async markViewed(contractId: string): Promise<any> {
    const contract = await this.contractModel.findOneAndUpdate(
      { id: contractId, status: ContractStatus.SENT },
      { $set: { status: ContractStatus.VIEWED, viewedAt: new Date() } },
      { new: true }
    );

    if (contract) {
      this.logger.log(`Contract viewed: ${contract.id}`);
    }

    return contract;
  }

  // === SIGN CONTRACT ===
  
  async signContract(contractId: string, signatureData?: any): Promise<Contract> {
    const contract = await this.contractModel.findOne({ id: contractId });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    if (contract.status === ContractStatus.SIGNED) {
      throw new BadRequestException('Contract already signed');
    }

    if (contract.status === ContractStatus.REJECTED) {
      throw new BadRequestException('Contract was rejected');
    }

    contract.status = ContractStatus.SIGNED;
    contract.signedAt = new Date();
    contract.metadata = { ...contract.metadata, signatureData };
    await contract.save();

    // Update deal if connected
    if (contract.dealId) {
      await this.dealModel.updateOne(
        { id: contract.dealId },
        { 
          $set: { 
            hasSignedContract: true,
            contractSignedAt: new Date(),
          },
          $push: { signedContracts: contract.id },
        }
      );
    }

    this.logger.log(`Contract signed: ${contract.id}`);

    // Send email notifications (async, non-blocking)
    this.sendSignedContractEmails(contract).catch(err => {
      this.logger.error(`Failed to send contract emails: ${err.message}`);
    });

    return contract;
  }

  /**
   * Send emails after contract is signed
   */
  private async sendSignedContractEmails(contract: Contract): Promise<void> {
    if (!contract.customerEmail) {
      this.logger.warn(`Contract ${contract.id} has no customer email`);
      return;
    }

    // Get manager email if available
    let managerEmail: string | null = null;
    if (contract.createdBy) {
      managerEmail = await this.emailService.getManagerEmail(contract.createdBy);
    }

    const emailData = {
      contractId: contract.id,
      contractNumber: contract.metadata?.contractNumber,
      contractTitle: contract.title,
      vehicleTitle: contract.vehicleTitle,
      price: contract.price,
      currency: contract.currency || 'USD',
      signedAt: contract.signedAt,
      signatureImageBase64: contract.metadata?.signatureData,
      customerName: contract.customerName || 'Клієнт',
      customerEmail: contract.customerEmail,
      managerName: undefined,
      managerEmail: managerEmail || undefined,
    };

    const result = await this.emailService.sendSignedContractEmails(emailData);
    
    this.logger.log(`Contract emails sent - Customer: ${result.customerSent}, Manager: ${result.managerSent}`);
  }

  // === REJECT CONTRACT ===
  
  async rejectContract(contractId: string, reason?: string): Promise<any> {
    const contract = await this.contractModel.findOneAndUpdate(
      { id: contractId },
      { 
        $set: { 
          status: ContractStatus.REJECTED, 
          rejectedAt: new Date(),
          rejectionReason: reason || 'Customer rejected',
        } 
      },
      { new: true }
    );

    if (contract) {
      this.logger.log(`Contract rejected: ${contract.id}`);
    }

    return contract;
  }

  // === CHECK IF CONTRACT REQUIRED FOR PAYMENT ===
  
  async isContractSignedForDeal(dealId: string): Promise<boolean> {
    const signedContract = await this.contractModel.findOne({
      dealId,
      status: ContractStatus.SIGNED,
    });

    return !!signedContract;
  }

  // === GET CONTRACT ===
  
  async getContract(contractId: string): Promise<any> {
    const contract = await this.contractModel.findOne({ id: contractId }).lean();
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    return toObjectResponse(contract);
  }

  // === GET USER CONTRACTS ===
  
  async getUserContracts(customerId: string): Promise<any[]> {
    const contracts = await this.contractModel.find({ customerId })
      .sort({ createdAt: -1 })
      .lean();
    
    return contracts.map(c => toObjectResponse(c));
  }

  // === GET DEAL CONTRACTS ===
  
  async getDealContracts(dealId: string): Promise<any[]> {
    const contracts = await this.contractModel.find({ dealId })
      .sort({ createdAt: -1 })
      .lean();
    
    return contracts.map(c => toObjectResponse(c));
  }

  // === GET PENDING CONTRACTS (ADMIN) ===
  
  async getPendingContracts(): Promise<any[]> {
    const contracts = await this.contractModel.find({
      status: { $in: [ContractStatus.DRAFT, ContractStatus.SENT, ContractStatus.VIEWED] },
    })
      .sort({ createdAt: -1 })
      .lean();
    
    return contracts.map(c => toObjectResponse(c));
  }

  // === GET ANALYTICS ===
  
  async getAnalytics(periodDays: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [total, byStatus, recentSigned] = await Promise.all([
      this.contractModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.contractModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.contractModel.find({ status: ContractStatus.SIGNED, signedAt: { $gte: startDate } })
        .sort({ signedAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      signedCount: byStatus.find(s => s._id === ContractStatus.SIGNED)?.count || 0,
      recentSigned: recentSigned.map(c => toObjectResponse(c)),
      periodDays,
    };
  }

  // === GET ACCOUNTING OVERVIEW (for Owner/Team Lead) ===
  
  async getAccountingOverview(periodDays: number = 30, statusFilter?: string): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    
    const matchStage: any = { createdAt: { $gte: startDate } };
    if (statusFilter) {
      matchStage.status = statusFilter;
    }

    const [
      contracts,
      statusStats,
      dailyStats,
      priceStats,
    ] = await Promise.all([
      // Get all contracts with customer info
      this.contractModel.find(matchStage)
        .sort({ createdAt: -1 })
        .lean(),
      
      // Status breakdown
      this.contractModel.aggregate([
        { $match: matchStage },
        { $group: { 
          _id: '$status', 
          count: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$price', 0] } },
        }},
      ]),
      
      // Daily signing trend
      this.contractModel.aggregate([
        { $match: { ...matchStage, status: ContractStatus.SIGNED } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$signedAt' } },
          count: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$price', 0] } },
        }},
        { $sort: { _id: 1 } },
      ]),
      
      // Price statistics
      this.contractModel.aggregate([
        { $match: { ...matchStage, price: { $gt: 0 } } },
        { $group: {
          _id: null,
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          totalValue: { $sum: '$price' },
          count: { $sum: 1 },
        }},
      ]),
    ]);

    // Calculate conversion rate
    const total = contracts.length;
    const signed = contracts.filter(c => c.status === ContractStatus.SIGNED).length;
    const conversionRate = total > 0 ? ((signed / total) * 100).toFixed(1) : 0;

    // Pending contracts requiring action
    const pending = contracts.filter(c => 
      [ContractStatus.DRAFT, ContractStatus.SENT, ContractStatus.VIEWED].includes(c.status)
    );

    // Overdue contracts
    const now = new Date();
    const overdue = contracts.filter(c => 
      c.expiresAt && new Date(c.expiresAt) < now && c.status !== ContractStatus.SIGNED
    );

    return {
      summary: {
        total,
        signed,
        pending: pending.length,
        rejected: contracts.filter(c => c.status === ContractStatus.REJECTED).length,
        overdue: overdue.length,
        conversionRate: `${conversionRate}%`,
      },
      statusBreakdown: statusStats.reduce((acc, s) => ({
        ...acc,
        [s._id]: { count: s.count, totalValue: s.totalValue },
      }), {}),
      priceStats: priceStats[0] || { avgPrice: 0, minPrice: 0, maxPrice: 0, totalValue: 0 },
      dailyTrend: dailyStats,
      pendingContracts: pending.map(c => toObjectResponse(c)),
      overdueContracts: overdue.map(c => toObjectResponse(c)),
      recentlySigned: contracts
        .filter(c => c.status === ContractStatus.SIGNED)
        .slice(0, 10)
        .map(c => toObjectResponse(c)),
      periodDays,
    };
  }

  // === EXPORT CONTRACTS ===
  
  async exportContracts(from?: string, to?: string, status?: string): Promise<any> {
    const query: any = {};
    
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    
    if (status) {
      query.status = status;
    }

    const contracts = await this.contractModel.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return {
      exportedAt: new Date().toISOString(),
      count: contracts.length,
      contracts: contracts.map(c => ({
        id: c.id,
        contractNumber: c.metadata?.contractNumber,
        customerName: c.customerName,
        customerEmail: c.customerEmail,
        type: c.type,
        title: c.title,
        status: c.status,
        price: c.price,
        currency: c.currency,
        vin: c.vin,
        vehicleTitle: c.vehicleTitle,
        createdAt: c.createdAt,
        sentAt: c.sentAt,
        signedAt: c.signedAt,
        rejectedAt: c.rejectedAt,
      })),
    };
  }
}
