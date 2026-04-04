/**
 * Advanced Analytics Service
 * 
 * Provides:
 * 1. Manager analytics (calls, leads, tasks, conversion)
 * 2. Team lead analytics (team performance, bottlenecks)
 * 3. Owner analytics (revenue, funnel, ROI)
 * 4. Real-time KPI tracking
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

interface DateRange {
  start: Date;
  end: Date;
}

@Injectable()
export class AdvancedAnalyticsService {
  private readonly logger = new Logger(AdvancedAnalyticsService.name);

  constructor(
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Call') private callModel: Model<any>,
    @InjectModel('Task') private taskModel: Model<any>,
    @InjectModel('Invoice') private invoiceModel: Model<any>,
    @InjectModel('Contract') private contractModel: Model<any>,
    @InjectModel('Shipment') private shipmentModel: Model<any>,
    @InjectModel('CarfaxRequest') private carfaxModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
  ) {}

  // === MANAGER ANALYTICS ===

  async getManagerAnalytics(managerId: string, periodDays: number = 7): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const query = { managerId, createdAt: { $gte: startDate } };

    const [
      totalLeads,
      hotLeads,
      contactedLeads,
      calls,
      completedCalls,
      noAnswerCalls,
      tasks,
      completedTasks,
      overdueTasks,
      carfaxRequests,
      carfaxUploaded,
      deals,
      wonDeals,
    ] = await Promise.all([
      this.leadModel.countDocuments({ assignedTo: managerId, createdAt: { $gte: startDate } }),
      this.leadModel.countDocuments({ assignedTo: managerId, temperature: 'hot', createdAt: { $gte: startDate } }),
      this.leadModel.countDocuments({ assignedTo: managerId, status: { $in: ['contacted', 'qualified', 'negotiation'] }, createdAt: { $gte: startDate } }),
      this.callModel.countDocuments({ managerId, startedAt: { $gte: startDate } }),
      this.callModel.countDocuments({ managerId, status: 'completed', startedAt: { $gte: startDate } }),
      this.callModel.countDocuments({ managerId, status: 'no_answer', startedAt: { $gte: startDate } }),
      this.taskModel.countDocuments({ assignedTo: managerId, createdAt: { $gte: startDate } }),
      this.taskModel.countDocuments({ assignedTo: managerId, status: 'completed', createdAt: { $gte: startDate } }),
      this.taskModel.countDocuments({
        assignedTo: managerId,
        status: { $nin: ['completed', 'cancelled'] },
        dueDate: { $lt: new Date() },
      }),
      this.carfaxModel.countDocuments({ managerId, createdAt: { $gte: startDate } }),
      this.carfaxModel.countDocuments({ managerId, status: 'uploaded', createdAt: { $gte: startDate } }),
      this.dealModel.countDocuments({ managerId, createdAt: { $gte: startDate } }),
      this.dealModel.countDocuments({ managerId, status: 'won', createdAt: { $gte: startDate } }),
    ]);

    // Calculate avg call duration
    const avgDuration = await this.callModel.aggregate([
      { $match: { managerId, talkTime: { $gt: 0 }, startedAt: { $gte: startDate } } },
      { $group: { _id: null, avg: { $avg: '$talkTime' } } },
    ]);

    // Calculate conversion rates
    const leadToContactRate = totalLeads > 0 ? Math.round((contactedLeads / totalLeads) * 100) : 0;
    const callAnswerRate = calls > 0 ? Math.round((completedCalls / calls) * 100) : 0;
    const dealConversionRate = totalLeads > 0 ? Math.round((wonDeals / totalLeads) * 100) : 0;
    const taskCompletionRate = tasks > 0 ? Math.round((completedTasks / tasks) * 100) : 0;
    const carfaxROI = carfaxRequests > 0 ? Math.round((wonDeals / carfaxRequests) * 100) : 0;

    return {
      managerId,
      periodDays,
      leads: {
        total: totalLeads,
        hot: hotLeads,
        contacted: contactedLeads,
        conversionRate: leadToContactRate,
      },
      calls: {
        total: calls,
        completed: completedCalls,
        noAnswer: noAnswerCalls,
        answerRate: callAnswerRate,
        avgDuration: Math.round(avgDuration[0]?.avg || 0),
      },
      tasks: {
        total: tasks,
        completed: completedTasks,
        overdue: overdueTasks,
        completionRate: taskCompletionRate,
      },
      carfax: {
        requested: carfaxRequests,
        uploaded: carfaxUploaded,
        roi: carfaxROI,
      },
      deals: {
        total: deals,
        won: wonDeals,
        conversionRate: dealConversionRate,
      },
    };
  }

  // === TEAM LEAD ANALYTICS ===

  async getTeamAnalytics(teamLeadId: string, periodDays: number = 7): Promise<any> {
    // Get team members
    const teamMembers = await this.userModel.find({
      $or: [{ teamLeadId }, { supervisorId: teamLeadId }],
      role: 'manager',
    }).lean();

    const memberIds = teamMembers.map(m => m.id);

    // Get analytics for each team member
    const memberAnalytics = await Promise.all(
      memberIds.map(id => this.getManagerAnalytics(id, periodDays))
    );

    // Aggregate team stats
    const teamStats = {
      totalLeads: 0,
      totalCalls: 0,
      completedCalls: 0,
      totalTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      totalDeals: 0,
      wonDeals: 0,
    };

    for (const ma of memberAnalytics) {
      teamStats.totalLeads += ma.leads.total;
      teamStats.totalCalls += ma.calls.total;
      teamStats.completedCalls += ma.calls.completed;
      teamStats.totalTasks += ma.tasks.total;
      teamStats.completedTasks += ma.tasks.completed;
      teamStats.overdueTasks += ma.tasks.overdue;
      teamStats.totalDeals += ma.deals.total;
      teamStats.wonDeals += ma.deals.won;
    }

    // Find underperformers
    const underperformers = memberAnalytics
      .filter(ma => ma.calls.answerRate < 50 || ma.tasks.overdue > 3 || ma.leads.conversionRate < 20)
      .map(ma => ({
        managerId: ma.managerId,
        issues: [
          ma.calls.answerRate < 50 ? 'Low call answer rate' : null,
          ma.tasks.overdue > 3 ? 'Too many overdue tasks' : null,
          ma.leads.conversionRate < 20 ? 'Low lead conversion' : null,
        ].filter(Boolean),
      }));

    // Find top performers
    const topPerformers = memberAnalytics
      .sort((a, b) => b.deals.won - a.deals.won)
      .slice(0, 3)
      .map(ma => ({ managerId: ma.managerId, deals: ma.deals.won, conversionRate: ma.deals.conversionRate }));

    return {
      teamLeadId,
      periodDays,
      teamSize: memberIds.length,
      teamStats: {
        ...teamStats,
        avgCallAnswerRate: teamStats.totalCalls > 0 ? Math.round((teamStats.completedCalls / teamStats.totalCalls) * 100) : 0,
        avgTaskCompletion: teamStats.totalTasks > 0 ? Math.round((teamStats.completedTasks / teamStats.totalTasks) * 100) : 0,
        avgDealConversion: teamStats.totalLeads > 0 ? Math.round((teamStats.wonDeals / teamStats.totalLeads) * 100) : 0,
      },
      underperformers,
      topPerformers,
      memberAnalytics,
    };
  }

  // === OWNER ANALYTICS ===

  async getOwnerAnalytics(periodDays: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Funnel analytics
    const [
      totalVisits,
      vinChecks,
      totalLeads,
      contactedLeads,
      qualifiedLeads,
      carfaxRequested,
      carfaxUploaded,
      contractsSent,
      contractsSigned,
      invoicesPaid,
      shipmentsStarted,
      delivered,
    ] = await Promise.all([
      // Would need analytics tracking module for visits
      Promise.resolve(0),
      Promise.resolve(0),
      this.leadModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.leadModel.countDocuments({ status: { $in: ['contacted', 'qualified'] }, createdAt: { $gte: startDate } }),
      this.leadModel.countDocuments({ status: 'qualified', createdAt: { $gte: startDate } }),
      this.carfaxModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.carfaxModel.countDocuments({ status: 'uploaded', createdAt: { $gte: startDate } }),
      this.contractModel.countDocuments({ status: 'sent', createdAt: { $gte: startDate } }),
      this.contractModel.countDocuments({ status: 'signed', createdAt: { $gte: startDate } }),
      this.invoiceModel.countDocuments({ status: 'paid', createdAt: { $gte: startDate } }),
      this.shipmentModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.shipmentModel.countDocuments({ status: 'delivered', createdAt: { $gte: startDate } }),
    ]);

    // Revenue analytics
    const revenueAgg = await this.invoiceModel.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const paidInvoicesCount = revenueAgg[0]?.count || 0;
    const avgDealSize = paidInvoicesCount > 0 ? Math.round(totalRevenue / paidInvoicesCount) : 0;

    // Carfax cost analytics
    const carfaxCostAgg = await this.carfaxModel.aggregate([
      { $match: { status: 'uploaded', createdAt: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$cost' }, reused: { $sum: { $cond: ['$reusedFromCache', 1, 0] } } } },
    ]);

    const carfaxTotalCost = carfaxCostAgg[0]?.total || 0;
    const carfaxReused = carfaxCostAgg[0]?.reused || 0;
    const carfaxSavedCost = carfaxReused * 40; // Assuming $40 per report

    // Manager profitability
    const managerProfitability = await this.invoiceModel.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: startDate } } },
      { $lookup: { from: 'deals', localField: 'dealId', foreignField: 'id', as: 'deal' } },
      { $unwind: { path: '$deal', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$deal.managerId',
          revenue: { $sum: '$amount' },
          deals: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    return {
      periodDays,
      funnel: {
        leads: totalLeads,
        contacted: contactedLeads,
        qualified: qualifiedLeads,
        carfaxRequested,
        carfaxUploaded,
        contractsSent,
        contractsSigned,
        invoicesPaid,
        shipmentsStarted,
        delivered,
        // Conversion rates
        leadToContactRate: totalLeads > 0 ? Math.round((contactedLeads / totalLeads) * 100) : 0,
        carfaxToDealRate: carfaxUploaded > 0 ? Math.round((contractsSigned / carfaxUploaded) * 100) : 0,
        contractToPaymentRate: contractsSigned > 0 ? Math.round((invoicesPaid / contractsSigned) * 100) : 0,
        paymentToDeliveryRate: invoicesPaid > 0 ? Math.round((delivered / invoicesPaid) * 100) : 0,
      },
      revenue: {
        total: totalRevenue,
        paidInvoices: paidInvoicesCount,
        avgDealSize,
      },
      carfax: {
        totalCost: carfaxTotalCost,
        reusedReports: carfaxReused,
        savedCost: carfaxSavedCost,
        roi: totalRevenue > 0 ? Math.round((totalRevenue / (carfaxTotalCost || 1)) * 100) / 100 : 0,
      },
      managerProfitability,
    };
  }

  // === DAILY SUMMARY ===

  async getDailySummary(): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      newLeads,
      hotLeads,
      calls,
      completedCalls,
      payments,
      contractsSigned,
      shipmentsUpdated,
    ] = await Promise.all([
      this.leadModel.countDocuments({ createdAt: { $gte: today } }),
      this.leadModel.countDocuments({ temperature: 'hot', createdAt: { $gte: today } }),
      this.callModel.countDocuments({ startedAt: { $gte: today } }),
      this.callModel.countDocuments({ status: 'completed', startedAt: { $gte: today } }),
      this.invoiceModel.countDocuments({ status: 'paid', paidAt: { $gte: today } }),
      this.contractModel.countDocuments({ status: 'signed', signedAt: { $gte: today } }),
      this.shipmentModel.countDocuments({ updatedAt: { $gte: today } }),
    ]);

    const revenueToday = await this.invoiceModel.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return {
      date: today.toISOString().split('T')[0],
      newLeads,
      hotLeads,
      calls,
      completedCalls,
      callAnswerRate: calls > 0 ? Math.round((completedCalls / calls) * 100) : 0,
      payments,
      contractsSigned,
      shipmentsUpdated,
      revenue: revenueToday[0]?.total || 0,
    };
  }
}
