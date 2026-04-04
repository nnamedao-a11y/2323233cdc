import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StaffActivityController } from './staff-activity.controller';
import { StaffActivityService } from './staff-activity.service';
import { StaffActivity, StaffActivitySchema } from './staff-activity.schema';
import { User, UserSchema } from '../users/user.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Deal, DealSchema } from '../deals/deal.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { HistoryReport, HistoryReportSchema } from '../history-reports/history-report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StaffActivity.name, schema: StaffActivitySchema },
      { name: User.name, schema: UserSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Deal.name, schema: DealSchema },
      { name: Task.name, schema: TaskSchema },
      { name: HistoryReport.name, schema: HistoryReportSchema },
    ]),
  ],
  controllers: [StaffActivityController],
  providers: [StaffActivityService],
  exports: [StaffActivityService],
})
export class StaffActivityModule {}
