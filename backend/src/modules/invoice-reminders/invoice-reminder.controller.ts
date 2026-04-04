/**
 * Invoice Reminder Controller
 */

import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvoiceReminderService } from './invoice-reminder.service';

@Controller('invoice-reminders')
export class InvoiceReminderController {
  constructor(private readonly reminderService: InvoiceReminderService) {}

  /**
   * Get critical overdue invoices
   */
  @Get('critical')
  @UseGuards(JwtAuthGuard)
  async getCriticalOverdue() {
    return this.reminderService.getCriticalOverdueInvoices();
  }

  /**
   * Get escalation summary
   */
  @Get('escalation-summary')
  @UseGuards(JwtAuthGuard)
  async getEscalationSummary() {
    return this.reminderService.getEscalationSummary();
  }

  /**
   * Force process reminders (admin only)
   */
  @Post('process')
  @UseGuards(JwtAuthGuard)
  async forceProcess() {
    return this.reminderService.forceProcessReminders();
  }
}
