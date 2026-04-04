import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HistoryReportController } from './history-report.controller';
import { HistoryReportService } from './history-report.service';
import { HistoryReport, HistoryReportSchema } from './history-report.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { CallSession, CallSessionSchema } from '../call-flow/call-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HistoryReport.name, schema: HistoryReportSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: CallSession.name, schema: CallSessionSchema },
    ]),
  ],
  controllers: [HistoryReportController],
  providers: [HistoryReportService],
  exports: [HistoryReportService],
})
export class HistoryReportModule {}
