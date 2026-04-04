import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../../leads/lead.schema';
import { Deal } from '../../deals/deal.schema';
import { Task } from '../../tasks/task.schema';

export interface ManagerStats {
  managerId: string;
  managerName?: string;
  
  // Lead metrics
  leads: number;
  newLeads: number;
  contacted: number;
  qualified: number;
  
  // Call metrics
  callAttempts: number;
  successfulContacts: number;
  
  // Deal metrics
  deals: number;
  dealsWon: number;
  dealsLost: number;
  dealValue: number;
  
  // Task metrics
  tasksCompleted: number;
  tasksOverdue: number;
  
  // Calculated metrics
  conversionRate: number;
  contactRate: number;
  avgResponseTime: number;
  
  // Critical
  hotLeadsMissed: number;
  
  // Period
  periodStart?: Date;
  periodEnd?: Date;
}

@Injectable()
export class KPIAggregatorService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Deal.name) private dealModel: Model<Deal>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
  ) {}

  async getManagerStats(managerId: string, periodDays: number = 30): Promise<ManagerStats> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const [
      leads,
      newLeads,
      contacted,
      qualified,
      deals,
      dealsWon,
      dealsLost,
      dealValue,
      tasksCompleted,
      tasksOverdue,
      hotMissed,
      callAttempts,
    ] = await Promise.all([
      // Total leads assigned
      this.leadModel.countDocuments({ 
        assignedTo: managerId, 
        isDeleted: false,
        createdAt: { $gte: periodStart }
      }),
      
      // New leads (not contacted)
      this.leadModel.countDocuments({ 
        assignedTo: managerId, 
        status: 'new',
        isDeleted: false,
        createdAt: { $gte: periodStart }
      }),
      
      // Contacted
      this.leadModel.countDocuments({ 
        assignedTo: managerId, 
        contactStatus: { $in: ['contacted', 'converted'] },
        isDeleted: false,
        createdAt: { $gte: periodStart }
      }),
      
      // Qualified
      this.leadModel.countDocuments({ 
        assignedTo: managerId, 
        status: { $in: ['qualified', 'proposal', 'negotiation', 'won'] },
        isDeleted: false,
        createdAt: { $gte: periodStart }
      }),
      
      // Total deals
      this.dealModel.countDocuments({ 
        managerId,
        createdAt: { $gte: periodStart }
      }),
      
      // Deals won
      this.dealModel.countDocuments({ 
        managerId,
        status: 'completed',
        createdAt: { $gte: periodStart }
      }),
      
      // Deals lost
      this.dealModel.countDocuments({ 
        managerId,
        status: 'cancelled',
        createdAt: { $gte: periodStart }
      }),
      
      // Deal value
      this.dealModel.aggregate([
        { 
          $match: { 
            managerId, 
            status: 'completed',
            createdAt: { $gte: periodStart }
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(r => r[0]?.total || 0),
      
      // Tasks completed
      this.taskModel.countDocuments({ 
        assignedTo: managerId,
        status: 'completed',
        updatedAt: { $gte: periodStart }
      }),
      
      // Tasks overdue
      this.taskModel.countDocuments({ 
        assignedTo: managerId,
        status: { $ne: 'completed' },
        dueDate: { $lt: new Date() }
      }),
      
      // HOT leads missed (not contacted within 24h)
      this.leadModel.countDocuments({ 
        assignedTo: managerId,
        intentScore: { $gte: 10 },
        contactStatus: { $in: ['new_request', 'no_answer'] },
        createdAt: { 
          $gte: periodStart,
          $lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        },
        isDeleted: false
      }),
      
      // Total call attempts
      this.leadModel.aggregate([
        { 
          $match: { 
            assignedTo: managerId,
            createdAt: { $gte: periodStart },
            isDeleted: false
          } 
        },
        { $group: { _id: null, total: { $sum: '$callAttempts' } } }
      ]).then(r => r[0]?.total || 0),
    ]);

    const conversionRate = leads > 0 ? dealsWon / leads : 0;
    const contactRate = leads > 0 ? contacted / leads : 0;
    
    return {
      managerId,
      leads,
      newLeads,
      contacted,
      qualified,
      callAttempts,
      successfulContacts: contacted,
      deals,
      dealsWon,
      dealsLost,
      dealValue,
      tasksCompleted,
      tasksOverdue,
      conversionRate,
      contactRate,
      avgResponseTime: 0, // TODO: Calculate from firstResponseAt
      hotLeadsMissed: hotMissed,
      periodStart,
      periodEnd: new Date(),
    };
  }

  async getTeamStats(teamLeadId: string, managerIds: string[], periodDays: number = 30): Promise<ManagerStats[]> {
    return Promise.all(
      managerIds.map(id => this.getManagerStats(id, periodDays))
    );
  }

  async getLeaderboard(limit: number = 10, periodDays: number = 30): Promise<any[]> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const leaderboard = await this.dealModel.aggregate([
      { 
        $match: { 
          status: 'completed',
          createdAt: { $gte: periodStart }
        } 
      },
      { 
        $group: { 
          _id: '$managerId',
          deals: { $sum: 1 },
          revenue: { $sum: '$amount' }
        } 
      },
      { $sort: { deals: -1 } },
      { $limit: limit }
    ]);

    return leaderboard;
  }
}
