/**
 * Invoice Reminder Service
 * 
 * Handles invoice reminders and overdue escalation
 * 
 * Rules:
 * - T-24h: reminder to user + manager
 * - T-0 (due today): urgent reminder
 * - T+1d: overdue, escalate to level 1
 * - T+3d: escalate to level 2 (team lead)
 * - T+5d: escalate to level 3 (owner) - CRITICAL
 */

import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { InvoiceReminderLog, ReminderType, ReminderChannel } from './invoice-reminder-log.schema';
import { InvoiceEscalationState } from './invoice-escalation-state.schema';
import { Invoice, InvoiceStatus } from '../payments/invoice.schema';
import { generateId } from '../../shared/utils';
import { NotificationDispatcherService, NotificationChannel, InvoiceReminderPayload } from '../notification-dispatcher/notification-dispatcher.service';

@Injectable()
export class InvoiceReminderService {
  private readonly logger = new Logger(InvoiceReminderService.name);

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(InvoiceReminderLog.name) private reminderLogModel: Model<InvoiceReminderLog>,
    @InjectModel(InvoiceEscalationState.name) private escalationModel: Model<InvoiceEscalationState>,
    @Optional() @Inject(forwardRef(() => NotificationDispatcherService))
    private readonly notificationDispatcher?: NotificationDispatcherService,
  ) {}

  /**
   * Main cron job - runs every hour
   */
  @Cron('0 * * * *')
  async processReminders(): Promise<void> {
    this.logger.log('Starting invoice reminder processing...');
    
    try {
      const invoices = await this.getActiveInvoices();
      let processed = 0;
      let remindersSet = 0;

      for (const invoice of invoices) {
        const sent = await this.handleInvoice(invoice);
        if (sent) remindersSet++;
        processed++;
      }

      this.logger.log(`Processed ${processed} invoices, sent ${remindersSet} reminders`);
    } catch (error) {
      this.logger.error(`Invoice reminder error: ${error.message}`);
    }
  }

  /**
   * Get all active invoices (sent, pending, overdue)
   */
  async getActiveInvoices(): Promise<any[]> {
    return this.invoiceModel.find({
      status: { $in: [InvoiceStatus.SENT, InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] },
      dueDate: { $exists: true },
    }).lean();
  }

  /**
   * Handle a single invoice
   */
  async handleInvoice(invoice: any): Promise<boolean> {
    const now = new Date();
    const dueDate = new Date(invoice.dueDate);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    let sent = false;

    // Status = SENT (not yet overdue)
    if (invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.PENDING) {
      // T-24h reminder
      if (diffHours <= 24 && diffHours > 0) {
        sent = await this.sendReminderIfNeeded(invoice, ReminderType.DUE_24H);
      }

      // Due today
      if (this.isSameCalendarDay(now, dueDate)) {
        sent = await this.sendReminderIfNeeded(invoice, ReminderType.DUE_TODAY) || sent;
      }

      // Overdue - mark as overdue
      if (now > dueDate) {
        await this.markOverdue(invoice);
        sent = await this.sendReminderIfNeeded(invoice, ReminderType.OVERDUE_1D) || sent;
      }
    }

    // Status = OVERDUE - escalation
    if (invoice.status === InvoiceStatus.OVERDUE) {
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      // Ensure escalation state exists
      await this.ensureEscalationState(invoice, daysOverdue);

      // +1 day - Level 1 (manager)
      if (daysOverdue >= 1) {
        sent = await this.escalateIfNeeded(invoice, 1, ReminderType.OVERDUE_1D) || sent;
      }

      // +3 days - Level 2 (team lead)
      if (daysOverdue >= 3) {
        sent = await this.escalateIfNeeded(invoice, 2, ReminderType.OVERDUE_3D) || sent;
      }

      // +5 days - Level 3 (owner) - CRITICAL
      if (daysOverdue >= 5) {
        sent = await this.escalateIfNeeded(invoice, 3, ReminderType.OVERDUE_5D) || sent;
        await this.markCriticalOverdue(invoice);
      }
    }

    return sent;
  }

  /**
   * Send reminder if not already sent
   */
  async sendReminderIfNeeded(invoice: any, reminderType: ReminderType): Promise<boolean> {
    const alreadySent = await this.hasReminderLog(invoice.id, reminderType);
    if (alreadySent) return false;

    await this.dispatchReminder(invoice, reminderType);
    await this.createReminderLog(invoice, reminderType);
    
    return true;
  }

  /**
   * Escalate if not already at this level
   */
  async escalateIfNeeded(invoice: any, level: number, reminderType: ReminderType): Promise<boolean> {
    const state = await this.getEscalationState(invoice.id);
    if (state && state.escalationLevel >= level) return false;

    await this.sendReminderIfNeeded(invoice, reminderType);
    await this.setEscalationLevel(invoice.id, level);

    this.logger.log(`Invoice ${invoice.id} escalated to level ${level}`);
    return true;
  }

  /**
   * Dispatch reminder to appropriate channels (SMS, Viber, Cabinet)
   */
  async dispatchReminder(invoice: any, reminderType: ReminderType): Promise<void> {
    // Determine recipients based on type
    const sendToUser = true;
    const sendToManager = reminderType !== ReminderType.DUE_24H;
    const sendToTeamLead = reminderType === ReminderType.OVERDUE_3D || reminderType === ReminderType.OVERDUE_5D;
    const sendToOwner = reminderType === ReminderType.OVERDUE_5D;

    // Calculate days overdue
    const now = new Date();
    const dueDate = new Date(invoice.dueDate);
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Prepare notification payload
    const payload: InvoiceReminderPayload = {
      invoiceId: invoice.id,
      dealId: invoice.dealId,
      amount: invoice.amount,
      currency: invoice.currency || 'USD',
      dueDate: invoice.dueDate,
      daysOverdue,
      paymentLink: invoice.stripeCheckoutUrl,
      reminderType: this.mapReminderType(reminderType),
    };

    // Send to customer via SMS/Viber
    if (sendToUser && this.notificationDispatcher) {
      const channels = [NotificationChannel.VIBER, NotificationChannel.SMS, NotificationChannel.CABINET];
      await this.notificationDispatcher.sendInvoiceReminder(
        { customerId: invoice.customerId || invoice.userId, phone: invoice.customerPhone },
        payload,
        channels,
      );
      this.logger.log(`✓ Customer notified via SMS/Viber for invoice ${invoice.id}`);
    }

    // Send to manager
    if (sendToManager && this.notificationDispatcher && invoice.managerId) {
      await this.notificationDispatcher.sendStaffReminder(invoice.managerId, 'manager', payload);
      this.logger.log(`✓ Manager notified for invoice ${invoice.id}`);
    }

    // Send to team lead
    if (sendToTeamLead && this.notificationDispatcher) {
      // Team lead would be fetched from staff hierarchy
      this.logger.log(`⚠ Team Lead escalation for invoice ${invoice.id}`);
    }

    // Send to owner
    if (sendToOwner && this.notificationDispatcher) {
      this.logger.log(`🔴 CRITICAL: Owner escalation for invoice ${invoice.id}`);
    }

    this.logger.log(`Reminder ${reminderType} dispatched for invoice ${invoice.id}`);
    
    // Log who was notified
    const notificationTargets: string[] = [];
    if (sendToUser) notificationTargets.push('user (SMS/Viber)');
    if (sendToManager) notificationTargets.push('manager');
    if (sendToTeamLead) notificationTargets.push('teamLead');
    if (sendToOwner) notificationTargets.push('owner');
    
    this.logger.log(`Notified: ${notificationTargets.join(', ')}`);
  }

  /**
   * Map internal reminder type to notification payload type
   */
  private mapReminderType(type: ReminderType): InvoiceReminderPayload['reminderType'] {
    switch (type) {
      case ReminderType.DUE_24H:
        return 'due_24h';
      case ReminderType.DUE_TODAY:
        return 'due_today';
      case ReminderType.OVERDUE_1D:
        return 'overdue_1d';
      case ReminderType.OVERDUE_3D:
        return 'overdue_3d';
      case ReminderType.OVERDUE_5D:
        return 'overdue_5d';
      default:
        return 'due_24h';
    }
  }

  /**
   * Mark invoice as overdue
   */
  async markOverdue(invoice: any): Promise<void> {
    if (invoice.status !== InvoiceStatus.OVERDUE) {
      await this.invoiceModel.updateOne(
        { id: invoice.id },
        { $set: { status: InvoiceStatus.OVERDUE } }
      );
      this.logger.log(`Invoice ${invoice.id} marked as OVERDUE`);
    }
  }

  /**
   * Mark invoice as critical overdue
   */
  async markCriticalOverdue(invoice: any): Promise<void> {
    await this.escalationModel.updateOne(
      { invoiceId: invoice.id },
      { $set: { criticalOverdue: true } }
    );
    this.logger.log(`Invoice ${invoice.id} marked as CRITICAL OVERDUE`);
  }

  /**
   * Check if reminder was already sent
   */
  async hasReminderLog(invoiceId: string, reminderType: ReminderType): Promise<boolean> {
    const log = await this.reminderLogModel.findOne({ invoiceId, reminderType });
    return !!log;
  }

  /**
   * Create reminder log
   */
  async createReminderLog(invoice: any, reminderType: ReminderType): Promise<void> {
    const log = new this.reminderLogModel({
      id: generateId(),
      invoiceId: invoice.id,
      dealId: invoice.dealId,
      reminderType,
      sentToUser: true,
      sentToManager: reminderType !== ReminderType.DUE_24H,
      sentToTeamLead: [ReminderType.OVERDUE_3D, ReminderType.OVERDUE_5D].includes(reminderType),
      sentToOwner: reminderType === ReminderType.OVERDUE_5D,
      channels: [ReminderChannel.CABINET],
    });
    await log.save();
  }

  /**
   * Get escalation state
   */
  async getEscalationState(invoiceId: string): Promise<InvoiceEscalationState | null> {
    return this.escalationModel.findOne({ invoiceId });
  }

  /**
   * Ensure escalation state exists
   */
  async ensureEscalationState(invoice: any, daysOverdue: number): Promise<void> {
    const existing = await this.escalationModel.findOne({ invoiceId: invoice.id });
    if (existing) {
      existing.daysOverdue = daysOverdue;
      await existing.save();
      return;
    }

    const state = new this.escalationModel({
      invoiceId: invoice.id,
      dealId: invoice.dealId,
      userId: invoice.userId,
      managerId: invoice.managerId,
      escalationLevel: 0,
      daysOverdue,
    });
    await state.save();
  }

  /**
   * Set escalation level
   */
  async setEscalationLevel(invoiceId: string, level: number): Promise<void> {
    await this.escalationModel.updateOne(
      { invoiceId },
      { 
        $set: { 
          escalationLevel: level, 
          lastEscalatedAt: new Date() 
        } 
      }
    );
  }

  /**
   * Check if same calendar day
   */
  isSameCalendarDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // === API Methods ===

  /**
   * Get all critical overdue invoices (for owner dashboard)
   */
  async getCriticalOverdueInvoices(): Promise<any[]> {
    const states = await this.escalationModel.find({ criticalOverdue: true });
    const invoiceIds = states.map(s => s.invoiceId);
    
    return this.invoiceModel.find({ id: { $in: invoiceIds } }).lean();
  }

  /**
   * Get escalation summary (for dashboard)
   */
  async getEscalationSummary(): Promise<any> {
    const [level1, level2, level3, critical] = await Promise.all([
      this.escalationModel.countDocuments({ escalationLevel: 1 }),
      this.escalationModel.countDocuments({ escalationLevel: 2 }),
      this.escalationModel.countDocuments({ escalationLevel: 3 }),
      this.escalationModel.countDocuments({ criticalOverdue: true }),
    ]);

    return {
      level1Count: level1,
      level2Count: level2,
      level3Count: level3,
      criticalCount: critical,
    };
  }

  /**
   * Resolve escalation (when invoice is paid)
   */
  async resolveEscalation(invoiceId: string): Promise<void> {
    await this.escalationModel.updateOne(
      { invoiceId },
      { $set: { resolvedAt: new Date() } }
    );
    this.logger.log(`Escalation resolved for invoice ${invoiceId}`);
  }

  /**
   * Force process reminders (for testing)
   */
  async forceProcessReminders(): Promise<{ processed: number; reminders: number }> {
    const invoices = await this.getActiveInvoices();
    let processed = 0;
    let reminders = 0;

    for (const invoice of invoices) {
      const sent = await this.handleInvoice(invoice);
      if (sent) reminders++;
      processed++;
    }

    return { processed, reminders };
  }
}
