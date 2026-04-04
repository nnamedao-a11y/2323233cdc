import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from './customer.schema';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';
import { PaginatedResult } from '../../shared/dto/pagination.dto';

/**
 * Customers Service v2.0 - Customer 360
 * 
 * Підтримує:
 * - CRUD операції
 * - findOrCreate по phone/email
 * - 360 view (leads, quotes, deals, deposits)
 * - Stats refresh
 * - LTV calculation
 */

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Quote') private quoteModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Deposit') private depositModel: Model<any>,
  ) {}

  async create(data: any, userId: string): Promise<any> {
    const customer = new this.customerModel({
      id: generateId(),
      ...data,
      lastInteractionAt: new Date(),
      createdBy: userId,
    });
    const saved = await customer.save();
    return toObjectResponse(saved);
  }

  async findOrCreateByContact(payload: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    source?: string;
    managerId?: string;
  }, userId?: string): Promise<any> {
    let customer = null;

    // Try to find by phone first
    if (payload.phone) {
      customer = await this.customerModel.findOne({ 
        phone: payload.phone, 
        isDeleted: false 
      });
    }

    // Try to find by email
    if (!customer && payload.email) {
      customer = await this.customerModel.findOne({ 
        email: payload.email, 
        isDeleted: false 
      });
    }

    if (customer) {
      // Update last interaction
      await this.customerModel.findByIdAndUpdate((customer as any)._id, {
        $set: { lastInteractionAt: new Date() }
      });
      return toObjectResponse(customer as any);
    }

    // Create new customer
    const newCustomer = new this.customerModel({
      id: generateId(),
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      email: payload.email || `${generateId()}@placeholder.com`,
      source: payload.source,
      assignedTo: payload.managerId,
      lastInteractionAt: new Date(),
      createdBy: userId || 'system',
    });

    const saved = await newCustomer.save();
    return toObjectResponse(saved as any);
  }

  async findAll(query: any): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', search, assignedTo, type, status } = query;

    const filter: any = { isDeleted: false };
    if (assignedTo) filter.assignedTo = assignedTo;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const [customers, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.customerModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(customers),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<any> {
    const customer = await this.customerModel.findOne({ id, isDeleted: false }).lean();
    return customer ? toObjectResponse(customer) : null;
  }

  async findByMongoId(mongoId: string): Promise<any> {
    const customer = await this.customerModel.findById(mongoId).lean();
    return customer ? toObjectResponse(customer) : null;
  }

  async update(id: string, data: any): Promise<any> {
    const customer = await this.customerModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: { ...data, lastInteractionAt: new Date() } },
      { new: true },
    ).lean();
    return customer ? toObjectResponse(customer) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.customerModel.findOneAndUpdate(
      { id },
      { $set: { isDeleted: true } },
    );
    return !!result;
  }

  // ============ 360 VIEW ============
  async get360(customerId: string): Promise<any> {
    // Find customer by custom id field only (not _id to avoid ObjectId cast)
    const customer = await this.customerModel.findOne({ 
      id: customerId,
      isDeleted: false 
    }).lean();
    
    if (!customer) throw new NotFoundException('Customer not found');

    const mongoId = String(customer._id);
    const customId = (customer as any).id;

    // Get all related entities including deposits
    const [leads, deals, deposits] = await Promise.all([
      this.leadModel.find({ 
        $or: [
          { customerId: mongoId },
          { customerId: customId },
          { convertedToCustomerId: mongoId },
          { convertedToCustomerId: customId },
        ],
        isDeleted: { $ne: true }
      }).sort({ createdAt: -1 }).lean(),
      
      this.dealModel.find({ 
        $or: [
          { customerId: mongoId },
          { customerId: customId },
        ],
        isDeleted: false 
      }).sort({ createdAt: -1 }).lean(),

      this.depositModel.find({
        $or: [
          { customerId: mongoId },
          { customerId: customId },
        ],
        isDeleted: false,
      }).sort({ createdAt: -1 }).lean(),
    ]);

    // Get quotes linked to leads
    const leadIds = leads.map((l: any) => String(l._id));
    const leadCustomIds = leads.map((l: any) => l.id).filter(Boolean);
    
    const quotes = await this.quoteModel.find({
      $or: [
        { customerId: mongoId },
        { customerId: customId },
        { leadId: { $in: [...leadIds, ...leadCustomIds] } },
      ]
    }).sort({ createdAt: -1 }).lean();

    // Calculate totals
    const totalDeposits = deposits.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
    const confirmedDeposits = deposits.filter((d: any) => d.status === 'confirmed' || d.status === 'completed');
    const confirmedDepositsAmount = confirmedDeposits.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

    return {
      customer: toObjectResponse(customer),
      leads: toArrayResponse(leads),
      quotes: toArrayResponse(quotes),
      deals: toArrayResponse(deals),
      deposits: toArrayResponse(deposits),
      summary: {
        totalLeads: leads.length,
        totalQuotes: quotes.length,
        totalDeals: deals.length,
        completedDeals: deals.filter((d: any) => d.status === 'completed').length,
        totalRevenue: deals.reduce((sum: number, d: any) => sum + (d.clientPrice || d.value || 0), 0),
        totalProfit: deals.reduce((sum: number, d: any) => sum + (d.realProfit || d.estimatedMargin || 0), 0),
        // Deposits summary
        depositsCount: deposits.length,
        totalDepositsAmount: totalDeposits,
        confirmedDepositsCount: confirmedDeposits.length,
        confirmedDepositsAmount,
      }
    };
  }

  // ============ REFRESH STATS ============
  async refreshStats(customerId: string): Promise<any> {
    const customer = await this.customerModel.findOne({ id: customerId });
    
    if (!customer) return null;

    const mongoId = String(customer._id);
    const customId = (customer as any).id;

    const [leads, deals, deposits] = await Promise.all([
      this.leadModel.find({ 
        $or: [
          { customerId: mongoId },
          { customerId: customId },
        ],
        isDeleted: { $ne: true }
      }).lean(),
      
      this.dealModel.find({ 
        $or: [
          { customerId: mongoId },
          { customerId: customId },
        ],
        isDeleted: false 
      }).lean(),

      this.depositModel.find({
        $or: [
          { customerId: mongoId },
          { customerId: customId },
        ],
        isDeleted: false,
      }).lean(),
    ]);

    const leadIds = leads.map((l: any) => String(l._id));
    const leadCustomIds = leads.map((l: any) => l.id).filter(Boolean);
    
    const quotes = await this.quoteModel.find({
      $or: [
        { customerId: mongoId },
        { customerId: customId },
        { leadId: { $in: [...leadIds, ...leadCustomIds] } },
      ]
    }).lean();

    const completedDeals = deals.filter((d: any) => d.status === 'completed');
    const cancelledDeals = deals.filter((d: any) => d.status === 'cancelled');
    
    const totalRevenue = deals.reduce((sum: number, d: any) => 
      sum + (d.clientPrice || d.value || 0), 0);
    const totalProfit = deals.reduce((sum: number, d: any) => 
      sum + (d.realProfit || d.estimatedMargin || 0), 0);

    const totalDepositsAmount = deposits.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
    
    const conversionRate = leads.length > 0 
      ? Math.round((deals.length / leads.length) * 100) 
      : 0;

    const updated = await this.customerModel.findByIdAndUpdate(
      customer._id,
      {
        $set: {
          totalLeads: leads.length,
          totalQuotes: quotes.length,
          totalDeals: deals.length,
          totalDeposits: deposits.length,
          completedDeals: completedDeals.length,
          cancelledDeals: cancelledDeals.length,
          totalValue: totalRevenue,
          totalRevenue,
          totalProfit,
          lifetimeValue: totalRevenue,
          conversionRate,
          lastInteractionAt: new Date(),
        }
      },
      { new: true }
    ).lean();

    return updated ? toObjectResponse(updated) : null;
  }

  async updateStats(id: string, totalDeals: number, totalValue: number): Promise<void> {
    await this.customerModel.findOneAndUpdate(
      { id },
      { $set: { totalDeals, totalValue } },
    );
  }

  async getStats(): Promise<any> {
    const [total, byType, byStatus, topCustomers] = await Promise.all([
      this.customerModel.countDocuments({ isDeleted: false }),
      this.customerModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.customerModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.customerModel.find({ isDeleted: false })
        .sort({ totalProfit: -1 })
        .limit(10)
        .lean(),
    ]);

    const totalRevenue = await this.customerModel.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$totalRevenue' }, profit: { $sum: '$totalProfit' } } },
    ]);

    return {
      total,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalProfit: totalRevenue[0]?.profit || 0,
      byType: byType.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      byStatus: byStatus.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      topCustomers: toArrayResponse(topCustomers),
    };
  }
}
