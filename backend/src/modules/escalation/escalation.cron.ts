import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EscalationService } from './escalation.service';

@Injectable()
export class EscalationCron {
  private readonly logger = new Logger(EscalationCron.name);

  constructor(
    private readonly escalationService: EscalationService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processEscalations() {
    this.logger.debug('Processing escalations...');
    
    try {
      const result = await this.escalationService.processEscalations();
      
      if (result.managerEscalated > 0 || result.ownerEscalated > 0) {
        this.logger.log(
          `Escalation run: ${result.managerEscalated} to TeamLead, ${result.ownerEscalated} to Owner`
        );
      }
    } catch (error) {
      this.logger.error('Escalation cron error:', error);
    }
  }
}
