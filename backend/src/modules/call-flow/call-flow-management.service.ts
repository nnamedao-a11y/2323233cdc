import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallSession, CallSessionStatus, NextActionType } from './call-session.schema';
import { Lead } from '../leads/lead.schema';
import { CallFlowService } from './services/call-flow.service';
import { generateId } from '../../shared/utils';

export interface UpdateCallSessionDto {
  status: CallSessionStatus;
  notes?: string;
  structuredNotes?: {
    objection?: string;
    budget?: number;
    interestLevel?: 'high' | 'medium' | 'low';
    nextStep?: string;
    clientComment?: string;
  };
  callDuration?: number;
}

export interface CallBoardColumn {
  status: CallSessionStatus;
  statusUk: string;
  count: number;
  sessions: CallSession[];
}

@Injectable()
export class CallFlowManagementService {
  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSession>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    private flowService: CallFlowService,
  ) {}

  // Create or get session for lead
  async getOrCreateSession(leadId: string, managerId: string): Promise<CallSession> {
    let session = await this.sessionModel.findOne({ leadId, managerId });
    
    if (!session) {
      session = new this.sessionModel({
        id: generateId(),
        leadId,
        managerId,
        status: CallSessionStatus.NEW,
        nextActionType: NextActionType.CALL,
        nextActionAt: this.flowService.getOptimalCallTime(),
      });
      await session.save();
    }

    return session;
  }

  // Update session after call
  async updateSession(sessionId: string, dto: UpdateCallSessionDto, managerId: string): Promise<CallSession | null> {
    const session = await this.sessionModel.findOne({ id: sessionId, managerId });
    if (!session) return null;

    // Update status
    session.status = dto.status;
    session.attempts += 1;
    session.lastCallAt = new Date();
    
    if (dto.notes) session.notes = dto.notes;
    if (dto.structuredNotes) session.structuredNotes = dto.structuredNotes;
    if (dto.callDuration) {
      session.lastCallDuration = dto.callDuration;
      session.totalCallDuration += dto.callDuration;
    }

    // Calculate next step
    const nextStep = this.flowService.getNextStep(dto.status, session.attempts);
    session.nextActionType = nextStep.nextActionType;
    session.nextActionAt = nextStep.nextActionAt;

    // Mark as closed if terminal status
    if ([CallSessionStatus.DEAL, CallSessionStatus.NOT_INTERESTED, CallSessionStatus.WRONG_NUMBER].includes(dto.status)) {
      session.closedAt = new Date();
      session.closedReason = dto.status;
    }

    await session.save();

    // Update lead contact status
    await this.updateLeadFromSession(session);

    return session;
  }

  // Get call board for manager (pipeline view)
  async getCallBoard(managerId: string): Promise<CallBoardColumn[]> {
    const statusLabels: Record<CallSessionStatus, string> = {
      [CallSessionStatus.NEW]: 'Нові',
      [CallSessionStatus.CALLED_NO_ANSWER]: 'Не відповів',
      [CallSessionStatus.CALLBACK_REQUESTED]: 'Callback',
      [CallSessionStatus.INTERESTED]: 'Зацікавлений',
      [CallSessionStatus.THINKING]: 'Думає',
      [CallSessionStatus.NEGOTIATION]: 'Переговори',
      [CallSessionStatus.NOT_INTERESTED]: 'Не зацікавлений',
      [CallSessionStatus.WRONG_NUMBER]: 'Невірний номер',
      [CallSessionStatus.DEAL]: 'Угода',
    };

    const pipeline: CallBoardColumn[] = [];

    for (const status of Object.values(CallSessionStatus)) {
      const sessions = await this.sessionModel.find({
        managerId,
        status,
      }).sort({ nextActionAt: 1 }).limit(50);

      pipeline.push({
        status,
        statusUk: statusLabels[status],
        count: sessions.length,
        sessions,
      });
    }

    return pipeline;
  }

  // Get due actions (need to call now)
  async getDueActions(managerId: string): Promise<CallSession[]> {
    const now = new Date();
    
    return this.sessionModel.find({
      managerId,
      nextActionAt: { $lte: now },
      status: { $nin: [CallSessionStatus.DEAL, CallSessionStatus.NOT_INTERESTED, CallSessionStatus.WRONG_NUMBER] },
    }).sort({ nextActionAt: 1 });
  }

  // Get stats for manager
  async getCallStats(managerId: string, periodDays: number = 30): Promise<any> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const [total, byStatus, avgAttempts, deals] = await Promise.all([
      this.sessionModel.countDocuments({ managerId, createdAt: { $gte: periodStart } }),
      
      this.sessionModel.aggregate([
        { $match: { managerId, createdAt: { $gte: periodStart } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      
      this.sessionModel.aggregate([
        { $match: { managerId, createdAt: { $gte: periodStart } } },
        { $group: { _id: null, avg: { $avg: '$attempts' } } },
      ]),
      
      this.sessionModel.countDocuments({ 
        managerId, 
        status: CallSessionStatus.DEAL,
        createdAt: { $gte: periodStart }
      }),
    ]);

    const contactRate = total > 0 
      ? byStatus.filter(s => !['new', 'no_answer'].includes(s._id)).reduce((sum, s) => sum + s.count, 0) / total 
      : 0;

    return {
      total,
      deals,
      byStatus: byStatus.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      avgAttempts: avgAttempts[0]?.avg || 0,
      contactRate,
      dealRate: total > 0 ? deals / total : 0,
    };
  }

  // Update lead based on session
  private async updateLeadFromSession(session: CallSession): Promise<void> {
    const leadUpdate: any = {
      lastContactAt: session.lastCallAt,
      callAttempts: session.attempts,
    };

    // Map session status to lead contact status
    const statusMap: Record<CallSessionStatus, string> = {
      [CallSessionStatus.NEW]: 'new_request',
      [CallSessionStatus.CALLED_NO_ANSWER]: 'no_answer',
      [CallSessionStatus.CALLBACK_REQUESTED]: 'callback_scheduled',
      [CallSessionStatus.INTERESTED]: 'contacted',
      [CallSessionStatus.THINKING]: 'awaiting_reply',
      [CallSessionStatus.NEGOTIATION]: 'contacted',
      [CallSessionStatus.NOT_INTERESTED]: 'lost_unreachable',
      [CallSessionStatus.WRONG_NUMBER]: 'lost_unreachable',
      [CallSessionStatus.DEAL]: 'converted',
    };

    leadUpdate.contactStatus = statusMap[session.status] || 'contacted';

    await this.leadModel.updateOne(
      { id: session.leadId },
      { $set: leadUpdate }
    );
  }
}
