/**
 * Ringostat Service
 * 
 * Handles:
 * 1. Webhook processing (call_started, call_answered, call_finished)
 * 2. Phone → Lead → Manager mapping
 * 3. Call board data
 * 4. Manager call analytics
 */

import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Call, CallStatus, CallDirection } from './call.schema';
import { generateId, toObjectResponse, toArrayResponse } from '../../shared/utils';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';

export interface RingostatWebhookDto {
  event: 'call_started' | 'call_answered' | 'call_finished';
  call_id: string;
  direction: 'inbound' | 'outbound';
  caller_phone: string;
  receiver_phone: string;
  manager_extension?: string;
  duration?: number;
  wait_time?: number;
  talk_time?: number;
  status?: string;
  recording_url?: string;
  started_at?: string;
  answered_at?: string;
  ended_at?: string;
  [key: string]: any;
}

@Injectable()
export class RingostatService implements OnModuleInit {
  private readonly logger = new Logger(RingostatService.name);
  private isEnabled: boolean = true;
  private apiKey: string | null = null;

  constructor(
    @InjectModel(Call.name) private callModel: Model<Call>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Customer') private customerModel: Model<any>,
    @Inject(forwardRef(() => IntegrationConfigService))
    private integrationConfigService: IntegrationConfigService,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
  }

  /**
   * Load Ringostat config from DB
   */
  private async loadConfig(): Promise<void> {
    try {
      const config = await this.integrationConfigService.getConfig(IntegrationProvider.RINGOSTAT);
      this.isEnabled = config?.isEnabled ?? true;
      
      const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.RINGOSTAT);
      this.apiKey = credentials?.apiKey || null;
      
      this.logger.log(`Ringostat config loaded: enabled=${this.isEnabled}`);
    } catch (error) {
      this.logger.warn(`Failed to load Ringostat config: ${error.message}`);
    }
  }

  /**
   * Check if Ringostat is enabled
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Send outbound API call (example for future use)
   */
  async sendApiCall(endpoint: string, data: any): Promise<any> {
    if (!this.isEnabled || !this.apiKey) {
      this.logger.warn('Ringostat API not configured');
      return null;
    }

    try {
      const response = await fetch(`https://api.ringostat.com/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      return response.json();
    } catch (error) {
      this.logger.error(`Ringostat API error: ${error.message}`);
      return null;
    }
  }

  // === WEBHOOK HANDLER ===
  
  async handleWebhook(data: RingostatWebhookDto): Promise<any> {
    this.logger.log(`Ringostat webhook: ${data.event} for call ${data.call_id}`);

    switch (data.event) {
      case 'call_started':
        return this.handleCallStarted(data);
      case 'call_answered':
        return this.handleCallAnswered(data);
      case 'call_finished':
        return this.handleCallFinished(data);
      default:
        this.logger.warn(`Unknown event: ${data.event}`);
        return { status: 'ignored', event: data.event };
    }
  }

  // === CALL STARTED ===
  
  private async handleCallStarted(data: RingostatWebhookDto): Promise<Call> {
    // Check if call already exists
    const existing = await this.callModel.findOne({ ringostatCallId: data.call_id });
    if (existing) {
      return existing;
    }

    // Map phone to lead/customer
    const phone = this.normalizePhone(data.caller_phone || data.receiver_phone);
    const mapping = await this.mapPhoneToEntities(phone, data.manager_extension);

    const call = new this.callModel({
      id: generateId(),
      ringostatCallId: data.call_id,
      direction: data.direction === 'inbound' ? CallDirection.INBOUND : CallDirection.OUTBOUND,
      callerPhone: data.caller_phone,
      receiverPhone: data.receiver_phone,
      managerExtension: data.manager_extension,
      leadId: mapping.leadId,
      managerId: mapping.managerId,
      managerName: mapping.managerName,
      customerId: mapping.customerId,
      customerName: mapping.customerName,
      status: CallStatus.STARTED,
      startedAt: data.started_at ? new Date(data.started_at) : new Date(),
      isHotLead: mapping.isHotLead,
      rawWebhookData: data,
    });

    await call.save();
    this.logger.log(`Call started: ${call.id} (${phone}) → Lead: ${mapping.leadId}`);

    return call;
  }

  // === CALL ANSWERED ===
  
  private async handleCallAnswered(data: RingostatWebhookDto): Promise<Call | null> {
    const call = await this.callModel.findOne({ ringostatCallId: data.call_id });
    if (!call) {
      // Create if not exists (late webhook)
      return this.handleCallStarted({ ...data, event: 'call_started' });
    }

    call.status = CallStatus.ANSWERED;
    call.answeredAt = data.answered_at ? new Date(data.answered_at) : new Date();
    call.waitTime = data.wait_time || 0;

    await call.save();
    this.logger.log(`Call answered: ${call.id}`);

    return call;
  }

  // === CALL FINISHED ===
  
  private async handleCallFinished(data: RingostatWebhookDto): Promise<Call | null> {
    let call = await this.callModel.findOne({ ringostatCallId: data.call_id });
    
    if (!call) {
      // Create if not exists
      const created = await this.handleCallStarted({ ...data, event: 'call_started' });
      call = created as any;
    }

    if (!call) {
      this.logger.warn(`Could not find or create call for ${data.call_id}`);
      return null;
    }

    // Determine final status
    let status = CallStatus.COMPLETED;
    if (data.status === 'no_answer' || (!data.talk_time && !data.answered_at)) {
      status = CallStatus.NO_ANSWER;
    } else if (data.status === 'busy') {
      status = CallStatus.BUSY;
    } else if (data.status === 'failed') {
      status = CallStatus.FAILED;
    }

    call.status = status;
    call.duration = data.duration || 0;
    call.talkTime = data.talk_time || 0;
    call.waitTime = data.wait_time || call.waitTime || 0;
    call.endedAt = data.ended_at ? new Date(data.ended_at) : new Date();
    call.recordingUrl = data.recording_url || '';
    call.hasRecording = !!data.recording_url;
    call.needsFollowUp = status === CallStatus.NO_ANSWER;

    await call.save();

    // Update lead with last call info
    if (call.leadId) {
      await this.updateLeadCallInfo(call);
    }

    this.logger.log(`Call finished: ${call.id} - ${status} (${call.talkTime}s)`);

    return call;
  }

  // === PHONE MAPPING ===
  
  private async mapPhoneToEntities(phone: string, managerExtension?: string): Promise<{
    leadId?: string;
    managerId?: string;
    managerName?: string;
    customerId?: string;
    customerName?: string;
    isHotLead?: boolean;
  }> {
    const result: any = {};

    // Find lead by phone
    const lead = await this.leadModel.findOne({
      $or: [
        { phone },
        { 'customer.phone': phone },
      ],
    });

    if (lead) {
      result.leadId = lead.id;
      result.managerId = lead.assignedTo;
      result.isHotLead = lead.temperature === 'hot' || lead.predictiveScore > 70;

      // Get manager name
      if (lead.assignedTo) {
        const manager = await this.userModel.findOne({ id: lead.assignedTo });
        if (manager) {
          result.managerName = `${manager.firstName} ${manager.lastName}`;
        }
      }
    }

    // Find customer by phone
    const customer = await this.customerModel.findOne({ phone });
    if (customer) {
      result.customerId = customer.id;
      result.customerName = customer.name || `${customer.firstName} ${customer.lastName}`;
    }

    // If manager extension provided, find manager
    if (managerExtension && !result.managerId) {
      const manager = await this.userModel.findOne({ extension: managerExtension });
      if (manager) {
        result.managerId = manager.id;
        result.managerName = `${manager.firstName} ${manager.lastName}`;
      }
    }

    return result;
  }

  private normalizePhone(phone: string): string {
    if (!phone) return '';
    // Remove all non-digits, keep + prefix if present
    const cleaned = phone.replace(/[^\d+]/g, '');
    return cleaned;
  }

  // === UPDATE LEAD ===
  
  private async updateLeadCallInfo(call: Call): Promise<void> {
    const updateData: any = {
      lastCallAt: call.endedAt || call.startedAt,
      lastCallStatus: call.status,
      lastCallDuration: call.talkTime || call.duration,
    };

    // Count no_answer calls
    if (call.status === CallStatus.NO_ANSWER) {
      const noAnswerCount = await this.callModel.countDocuments({
        leadId: call.leadId,
        status: CallStatus.NO_ANSWER,
        startedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // last 7 days
      });
      
      updateData.noAnswerCount = noAnswerCount;
      
      // Flag for SMS if 3+ no answers
      if (noAnswerCount >= 3) {
        updateData.needsSmsFollowUp = true;
      }
    }

    await this.leadModel.updateOne(
      { id: call.leadId },
      { $set: updateData }
    );
  }

  // === CALL BOARD ===
  
  async getCallBoard(managerId?: string, teamId?: string): Promise<any[]> {
    const query: any = {
      startedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    };

    if (managerId) {
      query.managerId = managerId;
    }

    const calls = await this.callModel.find(query)
      .sort({ startedAt: -1 })
      .limit(100)
      .lean();

    return calls.map(c => toObjectResponse(c));
  }

  // === UPDATE CALL (Manager Actions) ===
  
  async updateCall(callId: string, updates: {
    note?: string;
    outcome?: string;
    nextActionAt?: Date;
    nextActionType?: string;
    qualityScore?: number;
    isProcessed?: boolean;
  }): Promise<any> {
    const call = await this.callModel.findOneAndUpdate(
      { id: callId },
      { $set: updates },
      { new: true }
    ).lean();

    return call ? toObjectResponse(call) : null;
  }

  // === ANALYTICS ===
  
  async getCallAnalytics(managerId?: string, periodDays: number = 7): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const query: any = { startedAt: { $gte: startDate } };

    if (managerId) {
      query.managerId = managerId;
    }

    const [
      totalCalls,
      answeredCalls,
      noAnswerCalls,
      avgDuration,
      callsByStatus,
      callsByManager,
    ] = await Promise.all([
      this.callModel.countDocuments(query),
      this.callModel.countDocuments({ ...query, status: CallStatus.COMPLETED }),
      this.callModel.countDocuments({ ...query, status: CallStatus.NO_ANSWER }),
      this.callModel.aggregate([
        { $match: { ...query, talkTime: { $gt: 0 } } },
        { $group: { _id: null, avgTalkTime: { $avg: '$talkTime' } } },
      ]),
      this.callModel.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.callModel.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$managerId',
            managerName: { $first: '$managerName' },
            totalCalls: { $sum: 1 },
            answered: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            noAnswer: { $sum: { $cond: [{ $eq: ['$status', 'no_answer'] }, 1, 0] } },
            totalTalkTime: { $sum: '$talkTime' },
          },
        },
        { $sort: { totalCalls: -1 } },
      ]),
    ]);

    return {
      totalCalls,
      answeredCalls,
      noAnswerCalls,
      answerRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
      avgTalkTime: Math.round(avgDuration[0]?.avgTalkTime || 0),
      callsByStatus: callsByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      byManager: callsByManager,
      periodDays,
    };
  }

  // === GET CALLS FOR LEAD ===
  
  async getCallsForLead(leadId: string): Promise<any[]> {
    const calls = await this.callModel.find({ leadId })
      .sort({ startedAt: -1 })
      .lean();
    
    return calls.map(c => toObjectResponse(c));
  }

  // === GET CALLS NEEDING FOLLOW-UP ===
  
  async getCallsNeedingFollowUp(managerId?: string): Promise<any[]> {
    const query: any = {
      needsFollowUp: true,
      isProcessed: { $ne: true },
    };

    if (managerId) {
      query.managerId = managerId;
    }

    const calls = await this.callModel.find(query)
      .sort({ startedAt: -1 })
      .lean();

    return calls.map(c => toObjectResponse(c));
  }
}
