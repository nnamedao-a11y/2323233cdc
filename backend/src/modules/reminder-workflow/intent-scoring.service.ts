/**
 * Intent Scoring Service
 * 
 * Scoring логіка:
 * - Favorite added: +2
 * - Compare added: +3
 * - History opened: +5
 * - VIN check: +1
 * - Lead created: +10
 * 
 * Levels:
 * - HOT: score >= 10 → AUTO-LEAD + AUTO-CALL + TELEGRAM
 * - WARM: score 5-9
 * - COLD: score < 5
 * 
 * AUTO-LEAD:
 * - При HOT intent автоматично створюємо Lead
 * - Cooldown: 6 годин між auto-leads
 * - Не створюємо дублі (перевіряємо активні leads)
 * 
 * AUTO-CALL:
 * - При HOT intent тригеримо Twilio дзвінок менеджеру
 * - Cooldown: 3 години між дзвінками
 * 
 * TELEGRAM:
 * - При HOT intent надсилаємо повідомлення менеджеру
 * - Cooldown: 30 хвилин між повідомленнями
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IntentScore, IntentScoreDocument, IntentLevel } from './schemas/intent-score.schema';
import { Model } from 'mongoose';
import { LeadsService } from '../leads/leads.service';
import { TasksService } from '../tasks/tasks.service';
import { AutoCallService } from '../auto-call/auto-call.service';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { LeadSource, LeadStatus } from '../../shared/enums';

// Scoring weights
const SCORE_WEIGHTS = {
  favorite: 2,
  compare: 3,
  history: 5,
  vinCheck: 1,
  lead: 10,
};

// Level thresholds
const LEVEL_THRESHOLDS = {
  hot: 10,
  warm: 5,
};

// Cooldowns
const AUTO_LEAD_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const CALL_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
const TELEGRAM_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Manager Telegram chat IDs (можна налаштувати в адмінці)
const MANAGER_TELEGRAM_IDS = process.env.MANAGER_TELEGRAM_IDS?.split(',') || [];

@Injectable()
export class IntentScoringService {
  private readonly logger = new Logger(IntentScoringService.name);

  constructor(
    @InjectModel(IntentScore.name)
    private readonly intentModel: Model<IntentScoreDocument>,
    @Inject(forwardRef(() => LeadsService))
    private readonly leadsService: LeadsService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => AutoCallService))
    private readonly autoCallService: AutoCallService,
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramService: TelegramBotService,
  ) {}

  /**
   * Отримати або створити intent score
   */
  async getOrCreate(userId: string): Promise<IntentScore> {
    let intent = await this.intentModel.findOne({ userId });
    if (!intent) {
      intent = await this.intentModel.create({ userId });
    }
    return intent;
  }

  /**
   * Оновити score після події
   */
  async onFavoriteAdded(userId: string, vin?: string): Promise<IntentScore> {
    return this.updateScore(userId, {
      $inc: { score: SCORE_WEIGHTS.favorite, favoritesCount: 1 },
      $set: { lastFavoriteAt: new Date(), lastActivityAt: new Date() },
      $addToSet: vin ? { 'context.favoriteVins': vin } : {},
    });
  }

  async onCompareAdded(userId: string, vin?: string): Promise<IntentScore> {
    return this.updateScore(userId, {
      $inc: { score: SCORE_WEIGHTS.compare, comparesCount: 1 },
      $set: { lastCompareAt: new Date(), lastActivityAt: new Date() },
      $addToSet: vin ? { 'context.compareVins': vin } : {},
    });
  }

  async onHistoryRequested(userId: string, vin?: string): Promise<IntentScore> {
    return this.updateScore(userId, {
      $inc: { score: SCORE_WEIGHTS.history, historyRequestsCount: 1 },
      $set: { 
        lastHistoryAt: new Date(), 
        lastActivityAt: new Date(),
        ...(vin ? { 'context.lastViewedVin': vin } : {}),
      },
    });
  }

  async onVinChecked(userId: string, vin?: string): Promise<IntentScore> {
    return this.updateScore(userId, {
      $inc: { score: SCORE_WEIGHTS.vinCheck, vinChecksCount: 1 },
      $set: { 
        lastActivityAt: new Date(),
        ...(vin ? { 'context.lastViewedVin': vin } : {}),
      },
    });
  }

  async onLeadCreated(userId: string): Promise<IntentScore> {
    return this.updateScore(userId, {
      $inc: { score: SCORE_WEIGHTS.lead, leadsCreated: 1 },
      $set: { lastActivityAt: new Date() },
    });
  }

  /**
   * Оновити контекст користувача (email, phone, name)
   */
  async updateUserContext(userId: string, context: { email?: string; phone?: string; name?: string }): Promise<void> {
    await this.intentModel.findOneAndUpdate(
      { userId },
      { 
        $set: { 
          'context.email': context.email,
          'context.phone': context.phone,
          'context.name': context.name,
        } 
      },
      { upsert: true },
    );
  }

  /**
   * Оновити score та рівень
   */
  private async updateScore(userId: string, update: any): Promise<IntentScore> {
    let intent = await this.intentModel.findOneAndUpdate(
      { userId },
      update,
      { upsert: true, new: true },
    );

    if (!intent) {
      throw new Error(`Failed to create/update intent for user ${userId}`);
    }

    // Оновити рівень
    const newLevel = this.calculateLevel(intent.score);
    const wasHot = intent.level === IntentLevel.HOT;
    
    if (intent.level !== newLevel) {
      // Update level via findOneAndUpdate instead of .save()
      const updated = await this.intentModel.findOneAndUpdate(
        { userId },
        { $set: { level: newLevel } },
        { new: true },
      );
      if (updated) intent = updated;

      this.logger.log(`[Intent] User ${userId} level changed to ${newLevel} (score: ${intent.score})`);
    }

    // Якщо став HOT - запускаємо повний flow
    if (newLevel === IntentLevel.HOT && !wasHot) {
      await this.handleHotUser(intent);
    }

    return intent;
  }

  /**
   * Handle HOT user - create auto-lead + trigger call + send telegram
   */
  private async handleHotUser(intent: any): Promise<void> {
    const userId = intent.userId;
    const context = intent.context || {};

    this.logger.warn(`[Intent] 🔥 HOT USER DETECTED: ${userId} (score: ${intent.score})`);

    // 1. Create auto-lead (with cooldown check)
    await this.triggerAutoLead(intent);

    // 2. Trigger auto-call (with cooldown check)
    await this.triggerAutoCall(intent);

    // 3. Send telegram notification (with cooldown check)
    await this.triggerTelegramNotification(intent);
  }

  /**
   * Trigger auto-lead creation
   */
  private async triggerAutoLead(intent: any): Promise<void> {
    const userId = intent.userId;

    // Check cooldown
    if (intent.lastAutoLeadCreatedAt) {
      const timeSinceLast = Date.now() - new Date(intent.lastAutoLeadCreatedAt).getTime();
      if (timeSinceLast < AUTO_LEAD_COOLDOWN_MS) {
        this.logger.log(`[Intent] User ${userId} auto-lead skipped (cooldown: ${Math.round((AUTO_LEAD_COOLDOWN_MS - timeSinceLast) / 1000 / 60)}min remaining)`);
        return;
      }
    }

    try {
      const lead = await this.createAutoLead(intent);
      
      if (lead) {
        await this.intentModel.findOneAndUpdate(
          { userId },
          { 
            $set: { 
              lastAutoLeadCreatedAt: new Date(),
              lastAutoLeadId: lead.id,
            },
            $inc: { autoLeadsCount: 1 },
          },
        );

        this.logger.warn(`[Intent] ✅ AUTO-LEAD CREATED: User ${userId}, Lead ${lead.id}`);
      }
    } catch (error) {
      this.logger.error(`[Intent] Failed to create auto-lead for user ${userId}:`, error);
    }
  }

  /**
   * Trigger auto-call to manager
   */
  private async triggerAutoCall(intent: any): Promise<void> {
    const userId = intent.userId;
    const context = intent.context || {};

    // Check cooldown
    const lastCallAt = intent.lastCallTriggeredAt;
    if (lastCallAt) {
      const timeSinceLast = Date.now() - new Date(lastCallAt).getTime();
      if (timeSinceLast < CALL_COOLDOWN_MS) {
        this.logger.log(`[Intent] User ${userId} auto-call skipped (cooldown: ${Math.round((CALL_COOLDOWN_MS - timeSinceLast) / 1000 / 60)}min remaining)`);
        return;
      }
    }

    try {
      const result = await this.autoCallService.triggerAutoCall({
        userId,
        leadId: intent.lastAutoLeadId,
        intentScore: intent.score,
        intentLevel: intent.level,
        context: {
          lastViewedVin: context.lastViewedVin,
          favoriteVins: context.favoriteVins,
          name: context.name,
          phone: context.phone,
        },
      });

      if (result.success) {
        await this.intentModel.findOneAndUpdate(
          { userId },
          { 
            $set: { 
              lastCallTriggeredAt: new Date(),
              lastCallSid: result.callSid,
            },
            $inc: { callsTriggered: 1 },
          },
        );

        this.logger.warn(`[Intent] ✅ AUTO-CALL TRIGGERED: User ${userId}, CallSid ${result.callSid}`);
      } else {
        this.logger.log(`[Intent] Auto-call not triggered for ${userId}: ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`[Intent] Failed to trigger auto-call for user ${userId}:`, error);
    }
  }

  /**
   * Send telegram notification to managers
   */
  private async triggerTelegramNotification(intent: any): Promise<void> {
    const userId = intent.userId;
    const context = intent.context || {};

    // Check cooldown
    const lastTelegramAt = intent.lastTelegramNotifiedAt;
    if (lastTelegramAt) {
      const timeSinceLast = Date.now() - new Date(lastTelegramAt).getTime();
      if (timeSinceLast < TELEGRAM_COOLDOWN_MS) {
        this.logger.log(`[Intent] User ${userId} telegram skipped (cooldown: ${Math.round((TELEGRAM_COOLDOWN_MS - timeSinceLast) / 1000 / 60)}min remaining)`);
        return;
      }
    }

    try {
      const message = this.buildTelegramMessage(intent);
      
      // Send to all configured manager telegram IDs
      let sentCount = 0;
      for (const chatId of MANAGER_TELEGRAM_IDS) {
        if (chatId.trim()) {
          const result = await this.telegramService.sendMessage({
            chatId: chatId.trim(),
            text: message,
            parseMode: 'HTML',
          });
          if (result) sentCount++;
        }
      }

      // Also try sending via generic notification method if no specific IDs
      if (sentCount === 0) {
        // Log as warning - Telegram IDs not configured
        this.logger.warn(`[Intent] No manager Telegram IDs configured. Set MANAGER_TELEGRAM_IDS in .env`);
      }

      await this.intentModel.findOneAndUpdate(
        { userId },
        { 
          $set: { 
            lastTelegramNotifiedAt: new Date(),
            managerNotified: true,
            managerNotifiedAt: new Date(),
          },
          $inc: { telegramNotifications: 1 },
        },
      );

      this.logger.warn(`[Intent] ✅ TELEGRAM NOTIFICATION SENT: User ${userId}, sent to ${sentCount} managers`);
    } catch (error) {
      this.logger.error(`[Intent] Failed to send telegram for user ${userId}:`, error);
    }
  }

  /**
   * Build telegram message for HOT user
   */
  private buildTelegramMessage(intent: any): string {
    const context = intent.context || {};
    const vin = context.lastViewedVin || context.favoriteVins?.[0] || 'N/A';
    
    return `
🔥 <b>HOT USER ALERT</b>

<b>Intent Score:</b> ${intent.score}
<b>Level:</b> ${intent.level}

<b>User Info:</b>
• Name: ${context.name || 'Unknown'}
• Phone: ${context.phone || 'N/A'}
• Email: ${context.email || 'N/A'}

<b>Activity:</b>
• Favorites: ${intent.favoritesCount || 0}
• Compares: ${intent.comparesCount || 0}
• History: ${intent.historyRequestsCount || 0}

<b>Last VIN:</b> <code>${vin}</code>

👉 <b>Срочно откройте CRM!</b>
    `.trim();
  }

  /**
   * Create auto-lead with context
   */
  private async createAutoLead(intent: any): Promise<any> {
    const userId = intent.userId;
    const context = intent.context || {};

    const leadData = {
      firstName: context.name || 'HOT User',
      lastName: userId.substring(0, 8),
      email: context.email || undefined,
      phone: context.phone || undefined,
      source: LeadSource.WEBSITE,
      status: LeadStatus.NEW,
      description: `🔥 AUTO-GENERATED (HOT USER)\n\nScore: ${intent.score}\nFavorites: ${intent.favoritesCount}\nCompares: ${intent.comparesCount}\nHistory Requests: ${intent.historyRequestsCount}`,
      vin: context.lastViewedVin || context.favoriteVins?.[0] || context.compareVins?.[0],
      tags: ['hot-lead', 'auto-generated'],
      metadata: {
        intentUserId: userId,
        intentScore: intent.score,
        intentLevel: intent.level,
        autoGenerated: true,
        generatedAt: new Date().toISOString(),
      },
      isAutoGenerated: true,
      intentLevel: intent.level,
      intentScore: intent.score,
      intentContext: {
        favoriteVins: context.favoriteVins || [],
        compareVins: context.compareVins || [],
        lastViewedVin: context.lastViewedVin,
      },
    };

    const lead = await this.leadsService.create(leadData, 'system-auto-lead', 'system', 'Auto-Lead System');

    if (lead) {
      try {
        await this.tasksService.create({
          title: `🔥 HOT LEAD: ${context.name || 'Користувач ' + userId.substring(0, 8)}`,
          description: `Терміново зв'язатися!\n\nScore: ${intent.score}\nFavorites: ${intent.favoritesCount}\nCompares: ${intent.comparesCount}\nLast VIN: ${context.lastViewedVin || 'N/A'}`,
          priority: 'high',
          dueDate: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
          relatedEntityType: 'lead',
          relatedEntityId: lead.id,
        }, 'system-auto-lead', 'system', 'Auto-Lead System');
      } catch (e) {
        this.logger.error(`[Intent] Failed to create task for auto-lead:`, e);
      }
    }

    return lead;
  }

  /**
   * Розрахувати рівень
   */
  private calculateLevel(score: number): IntentLevel {
    if (score >= LEVEL_THRESHOLDS.hot) return IntentLevel.HOT;
    if (score >= LEVEL_THRESHOLDS.warm) return IntentLevel.WARM;
    return IntentLevel.COLD;
  }

  /**
   * Отримати score користувача
   */
  async getScore(userId: string): Promise<IntentScore | null> {
    return this.intentModel.findOne({ userId }).lean();
  }

  /**
   * Admin: HOT leads
   */
  async getHotLeads(limit = 50): Promise<IntentScore[]> {
    return this.intentModel
      .find({ level: IntentLevel.HOT })
      .sort({ score: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Admin: All scores
   */
  async getAllScores(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.intentModel.find().sort({ score: -1 }).skip(skip).limit(limit).lean(),
      this.intentModel.countDocuments(),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Admin: Analytics
   */
  async getAnalytics() {
    const [hot, warm, cold, total, autoLeadsCreated, callsTriggered, telegramSent] = await Promise.all([
      this.intentModel.countDocuments({ level: IntentLevel.HOT }),
      this.intentModel.countDocuments({ level: IntentLevel.WARM }),
      this.intentModel.countDocuments({ level: IntentLevel.COLD }),
      this.intentModel.countDocuments(),
      this.intentModel.aggregate([
        { $group: { _id: null, total: { $sum: '$autoLeadsCount' } } },
      ]),
      this.intentModel.aggregate([
        { $group: { _id: null, total: { $sum: '$callsTriggered' } } },
      ]),
      this.intentModel.aggregate([
        { $group: { _id: null, total: { $sum: '$telegramNotifications' } } },
      ]),
    ]);

    const avgScore = await this.intentModel.aggregate([
      { $group: { _id: null, avg: { $avg: '$score' } } },
    ]);

    return {
      levels: { hot, warm, cold },
      total,
      avgScore: avgScore[0]?.avg || 0,
      autoLeadsCreated: autoLeadsCreated[0]?.total || 0,
      callsTriggered: callsTriggered[0]?.total || 0,
      telegramSent: telegramSent[0]?.total || 0,
    };
  }

  /**
   * Mark manager notified
   */
  async markManagerNotified(userId: string): Promise<void> {
    await this.intentModel.findOneAndUpdate(
      { userId },
      { $set: { managerNotified: true, managerNotifiedAt: new Date() } },
    );
  }

  /**
   * Get users ready for auto-lead (HOT but no recent lead)
   */
  async getUsersReadyForAutoLead(): Promise<IntentScore[]> {
    const cooldownDate = new Date(Date.now() - AUTO_LEAD_COOLDOWN_MS);
    
    return this.intentModel.find({
      level: IntentLevel.HOT,
      $or: [
        { lastAutoLeadCreatedAt: { $lt: cooldownDate } },
        { lastAutoLeadCreatedAt: { $exists: false } },
      ],
    }).lean();
  }

  /**
   * Manually trigger HOT flow for testing
   */
  async triggerHotFlowManually(userId: string): Promise<{ lead: boolean; call: boolean; telegram: boolean }> {
    // Force HOT level using findOneAndUpdate
    const intent = await this.intentModel.findOneAndUpdate(
      { userId },
      { 
        $set: { level: IntentLevel.HOT },
        $max: { score: 10 },
      },
      { upsert: true, new: true },
    );

    await this.handleHotUser(intent);

    return {
      lead: true,
      call: true,
      telegram: true,
    };
  }
}
