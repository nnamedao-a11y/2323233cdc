import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AutomationService } from './automation.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AutomationRule } from './schemas/automation-rule.schema';

@Processor('automation')
export class AutomationProcessor {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(
    private automationService: AutomationService,
    @InjectModel(AutomationRule.name) private ruleModel: Model<AutomationRule>,
  ) {}

  @Process('execute-rule')
  async handleExecuteRule(job: Job<{ ruleId: string; event: any }>) {
    this.logger.log(`Processing delayed automation rule: ${job.data.ruleId}`);
    
    const rule = await this.ruleModel.findOne({ id: job.data.ruleId, isActive: true });
    if (!rule) {
      this.logger.warn(`Rule ${job.data.ruleId} not found or inactive`);
      return;
    }

    await this.automationService.executeRule(rule, job.data.event);
  }
}
