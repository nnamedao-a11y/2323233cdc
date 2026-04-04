/**
 * BIBI Cars - Cadence Cron
 * Executes due cadence steps
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CadenceService } from './cadence.service';

@Injectable()
export class CadenceCron {
  private readonly logger = new Logger(CadenceCron.name);

  constructor(private readonly cadenceService: CadenceService) {}

  // Run every 5 minutes
  @Cron('*/5 * * * *')
  async processCadences() {
    this.logger.log('Processing due cadence runs...');
    await this.cadenceService.executeDueRuns();
  }
}
