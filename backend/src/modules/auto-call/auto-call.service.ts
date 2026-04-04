/**
 * Auto-Call Service
 * 
 * Сервіс автоматичних дзвінків менеджерам при HOT intent
 * - Twilio інтеграція
 * - Cooldown logic
 * - Voice message generation
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AutoCallConfig, AutoCallConfigDocument } from './schemas/auto-call-config.schema';
import { AutoCallLog, AutoCallLogDocument, CallStatus } from './schemas/auto-call-log.schema';

@Injectable()
export class AutoCallService {
  private readonly logger = new Logger(AutoCallService.name);
  private twilioClient: any = null;

  constructor(
    @InjectModel(AutoCallConfig.name)
    private readonly configModel: Model<AutoCallConfigDocument>,
    @InjectModel(AutoCallLog.name)
    private readonly logModel: Model<AutoCallLogDocument>,
    private readonly configService: ConfigService,
  ) {
    this.initTwilioClient();
  }

  /**
   * Initialize Twilio client from config
   */
  private async initTwilioClient(): Promise<void> {
    try {
      const config = await this.getConfig();
      if (config?.twilioAccountSid && config?.twilioAuthToken) {
        const Twilio = require('twilio');
        this.twilioClient = new Twilio(config.twilioAccountSid, config.twilioAuthToken);
        this.logger.log('[AutoCall] Twilio client initialized');
      } else {
        this.logger.warn('[AutoCall] Twilio credentials not configured');
      }
    } catch (error) {
      this.logger.warn('[AutoCall] Failed to initialize Twilio client:', error.message);
    }
  }

  /**
   * Get or create configuration
   */
  async getConfig(): Promise<AutoCallConfig> {
    let config = await this.configModel.findOne({ configId: 'main' });
    if (!config) {
      config = await this.configModel.create({
        configId: 'main',
        enabled: false,
        twilioAccountSid: this.configService.get('TWILIO_ACCOUNT_SID'),
        twilioAuthToken: this.configService.get('TWILIO_AUTH_TOKEN'),
        twilioPhoneNumber: this.configService.get('TWILIO_PHONE_NUMBER'),
      });
    }
    return config;
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<AutoCallConfig>): Promise<AutoCallConfig> {
    const config = await this.configModel.findOneAndUpdate(
      { configId: 'main' },
      { $set: updates },
      { upsert: true, new: true },
    );

    // Reinitialize Twilio if credentials changed
    if (updates.twilioAccountSid || updates.twilioAuthToken) {
      await this.initTwilioClient();
    }

    return config;
  }

  /**
   * Trigger auto-call for HOT user
   */
  async triggerAutoCall(payload: {
    userId: string;
    leadId?: string;
    intentScore: number;
    intentLevel: string;
    context: {
      lastViewedVin?: string;
      favoriteVins?: string[];
      name?: string;
      phone?: string;
    };
  }): Promise<{ success: boolean; callSid?: string; error?: string }> {
    const config = await this.getConfig();

    // Check if enabled
    if (!config.enabled) {
      this.logger.log(`[AutoCall] Auto-call disabled, skipping for user ${payload.userId}`);
      return { success: false, error: 'Auto-call disabled' };
    }

    // Check if Twilio configured
    if (!this.twilioClient || !config.twilioPhoneNumber) {
      this.logger.warn(`[AutoCall] Twilio not configured, skipping call`);
      return { success: false, error: 'Twilio not configured' };
    }

    // Check if any manager phones configured
    if (!config.managerPhones || config.managerPhones.length === 0) {
      this.logger.warn(`[AutoCall] No manager phones configured`);
      return { success: false, error: 'No manager phones configured' };
    }

    // Check cooldown
    const lastCall = await this.logModel.findOne({
      userId: payload.userId,
      status: { $in: [CallStatus.INITIATED, CallStatus.ANSWERED, CallStatus.COMPLETED] },
      createdAt: { $gte: new Date(Date.now() - config.callCooldownMs) },
    });

    if (lastCall) {
      const callCreatedAt = (lastCall as any).createdAt || new Date();
      const remainingMs = config.callCooldownMs - (Date.now() - new Date(callCreatedAt).getTime());
      this.logger.log(`[AutoCall] Cooldown active for user ${payload.userId}, ${Math.round(remainingMs / 60000)}min remaining`);
      return { success: false, error: 'Cooldown active' };
    }

    // Check working hours
    if (!this.isWithinWorkingHours(config)) {
      this.logger.log(`[AutoCall] Outside working hours, skipping call`);
      return { success: false, error: 'Outside working hours' };
    }

    // Build voice message
    const voiceMessage = this.buildVoiceMessage(config.voiceMessageTemplate, {
      vin: payload.context.lastViewedVin || 'N/A',
      score: payload.intentScore.toString(),
      name: payload.context.name || 'Невідомий',
      level: payload.intentLevel.toUpperCase(),
    });

    // Call first available manager
    const managerPhone = config.managerPhones[0]; // TODO: round-robin or availability check

    try {
      this.logger.warn(`[AutoCall] 🔥 Initiating HOT call to manager ${managerPhone} for user ${payload.userId}`);

      // Create call log first
      const callLog = await this.logModel.create({
        userId: payload.userId,
        leadId: payload.leadId,
        managerPhone,
        status: CallStatus.INITIATED,
        voiceMessage,
        context: {
          intentScore: payload.intentScore,
          intentLevel: payload.intentLevel,
          lastViewedVin: payload.context.lastViewedVin,
          favoriteVins: payload.context.favoriteVins,
        },
      });

      // Make Twilio call
      const call = await this.twilioClient.calls.create({
        to: managerPhone,
        from: config.twilioPhoneNumber,
        twiml: `<Response><Say language="uk-UA">${voiceMessage}</Say></Response>`,
        statusCallback: `${this.configService.get('API_BASE_URL') || ''}/api/auto-call/webhook/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      });

      // Update log with call SID
      await this.logModel.findByIdAndUpdate(callLog._id, {
        twilioCallSid: call.sid,
      });

      // Update config stats
      await this.configModel.findOneAndUpdate(
        { configId: 'main' },
        { $inc: { totalCallsInitiated: 1 }, $set: { lastCallAt: new Date() } },
      );

      this.logger.warn(`[AutoCall] ✅ Call initiated successfully. SID: ${call.sid}`);

      return { success: true, callSid: call.sid };

    } catch (error) {
      this.logger.error(`[AutoCall] ❌ Failed to initiate call:`, error.message);

      // Log error
      await this.logModel.create({
        userId: payload.userId,
        leadId: payload.leadId,
        managerPhone,
        status: CallStatus.FAILED,
        voiceMessage,
        errorMessage: error.message,
        context: {
          intentScore: payload.intentScore,
          intentLevel: payload.intentLevel,
        },
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle Twilio status webhook
   */
  async handleStatusWebhook(data: {
    CallSid: string;
    CallStatus: string;
    CallDuration?: string;
    From?: string;
    To?: string;
  }): Promise<void> {
    this.logger.log(`[AutoCall] Webhook: CallSid=${data.CallSid}, Status=${data.CallStatus}`);

    const statusMap: { [key: string]: CallStatus } = {
      'initiated': CallStatus.INITIATED,
      'ringing': CallStatus.RINGING,
      'in-progress': CallStatus.ANSWERED,
      'answered': CallStatus.ANSWERED,
      'completed': CallStatus.COMPLETED,
      'failed': CallStatus.FAILED,
      'no-answer': CallStatus.NO_ANSWER,
      'busy': CallStatus.BUSY,
    };

    const status = statusMap[data.CallStatus] || CallStatus.FAILED;

    const update: any = { status };

    if (status === CallStatus.ANSWERED) {
      update.answeredAt = new Date();
      await this.configModel.findOneAndUpdate(
        { configId: 'main' },
        { $inc: { totalCallsAnswered: 1 } },
      );
    }

    if (status === CallStatus.COMPLETED) {
      update.completedAt = new Date();
      if (data.CallDuration) {
        update.duration = parseInt(data.CallDuration, 10);
      }
    }

    await this.logModel.findOneAndUpdate(
      { twilioCallSid: data.CallSid },
      { $set: update },
    );
  }

  /**
   * Get call logs
   */
  async getLogs(page = 1, limit = 50, filters?: { userId?: string; status?: CallStatus }) {
    const query: any = {};
    if (filters?.userId) query.userId = filters.userId;
    if (filters?.status) query.status = filters.status;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.logModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.logModel.countDocuments(query),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Get analytics
   */
  async getAnalytics() {
    const [
      config,
      totalCalls,
      answeredCalls,
      todayCalls,
      callsByStatus,
    ] = await Promise.all([
      this.getConfig(),
      this.logModel.countDocuments(),
      this.logModel.countDocuments({ status: CallStatus.ANSWERED }),
      this.logModel.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      this.logModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts = callsByStatus.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {} as Record<string, number>);

    return {
      enabled: config.enabled,
      twilioConfigured: !!config.twilioAccountSid && !!config.twilioPhoneNumber,
      managersCount: config.managerPhones?.length || 0,
      totalCalls,
      answeredCalls,
      answerRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
      todayCalls,
      lastCallAt: config.lastCallAt,
      callsByStatus: statusCounts,
    };
  }

  /**
   * Build voice message from template
   */
  private buildVoiceMessage(template: string, vars: Record<string, string>): string {
    let message = template;
    for (const [key, value] of Object.entries(vars)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return message;
  }

  /**
   * Check if current time is within working hours
   */
  private isWithinWorkingHours(config: AutoCallConfig): boolean {
    if (!config.workingHours) return true;

    try {
      const now = new Date();
      const [startHour, startMin] = config.workingHours.start.split(':').map(Number);
      const [endHour, endMin] = config.workingHours.end.split(':').map(Number);

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch {
      return true;
    }
  }

  /**
   * Test call (for admin)
   */
  async testCall(phoneNumber: string): Promise<{ success: boolean; callSid?: string; error?: string }> {
    const config = await this.getConfig();

    if (!this.twilioClient || !config.twilioPhoneNumber) {
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      const call = await this.twilioClient.calls.create({
        to: phoneNumber,
        from: config.twilioPhoneNumber,
        twiml: `<Response><Say language="uk-UA">Це тестовий дзвінок від BIBI Cars CRM. Налаштування працюють коректно.</Say></Response>`,
      });

      return { success: true, callSid: call.sid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendSMS(to: string, message: string): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    const config = await this.getConfig();

    if (!this.twilioClient || !config.twilioPhoneNumber) {
      this.logger.warn('[AutoCall] SMS: Twilio not configured, logging only');
      this.logger.log(`[AutoCall] SMS to ${to}: ${message}`);
      return { success: true, messageSid: 'mock-' + Date.now() };
    }

    try {
      const sms = await this.twilioClient.messages.create({
        to: to,
        from: config.twilioPhoneNumber,
        body: message,
      });

      this.logger.log(`[AutoCall] SMS sent to ${to}: ${sms.sid}`);
      return { success: true, messageSid: sms.sid };
    } catch (error: any) {
      this.logger.error(`[AutoCall] SMS failed to ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send WhatsApp message via Twilio
   */
  async sendWhatsApp(to: string, message: string): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    const config = await this.getConfig();

    if (!this.twilioClient || !config.twilioPhoneNumber) {
      this.logger.warn('[AutoCall] WhatsApp: Twilio not configured, logging only');
      this.logger.log(`[AutoCall] WhatsApp to ${to}: ${message}`);
      return { success: true, messageSid: 'mock-' + Date.now() };
    }

    try {
      // WhatsApp requires 'whatsapp:' prefix
      const whatsappFrom = `whatsapp:${config.twilioPhoneNumber}`;
      const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      const whatsapp = await this.twilioClient.messages.create({
        to: whatsappTo,
        from: whatsappFrom,
        body: message,
      });

      this.logger.log(`[AutoCall] WhatsApp sent to ${to}: ${whatsapp.sid}`);
      return { success: true, messageSid: whatsapp.sid };
    } catch (error: any) {
      this.logger.error(`[AutoCall] WhatsApp failed to ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
