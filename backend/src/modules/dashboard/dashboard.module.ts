import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Controllers
import { DashboardController } from './controllers/dashboard.controller';

// Services
import { DashboardService } from './services/dashboard.service';
import { SlaDashboardService } from './services/sla-dashboard.service';
import { WorkloadDashboardService } from './services/workload-dashboard.service';
import { LeadsDashboardService } from './services/leads-dashboard.service';
import { CallbacksDashboardService } from './services/callbacks-dashboard.service';
import { DepositsDashboardService } from './services/deposits-dashboard.service';
import { DocumentsDashboardService } from './services/documents-dashboard.service';
import { RoutingDashboardService } from './services/routing-dashboard.service';
import { SystemHealthDashboardService } from './services/system-health-dashboard.service';
import { VehiclesDashboardService } from './services/vehicles-dashboard.service';

// Schemas
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { User, UserSchema } from '../users/user.schema';
import { Deposit, DepositSchema } from '../deposits/deposit.schema';
import { Document, DocumentSchema } from '../documents/schemas/document.schema';
import { Message, MessageSchema } from '../communications/schemas/message.schema';
import { AssignmentHistory, AssignmentHistorySchema } from '../lead-routing/schemas/assignment-history.schema';
import { Vehicle, VehicleSchema } from '../ingestion/schemas/vehicle.schema';

// Modules for legacy endpoints
import { LeadsModule } from '../leads/leads.module';
import { CustomersModule } from '../customers/customers.module';
import { DealsModule } from '../deals/deals.module';
import { DepositsModule } from '../deposits/deposits.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Task.name, schema: TaskSchema },
      { name: User.name, schema: UserSchema },
      { name: Deposit.name, schema: DepositSchema },
      { name: Document.name, schema: DocumentSchema },
      { name: Message.name, schema: MessageSchema },
      { name: AssignmentHistory.name, schema: AssignmentHistorySchema },
      { name: Vehicle.name, schema: VehicleSchema },
    ]),
    LeadsModule,
    CustomersModule,
    DealsModule,
    DepositsModule,
    TasksModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    SlaDashboardService,
    WorkloadDashboardService,
    LeadsDashboardService,
    CallbacksDashboardService,
    DepositsDashboardService,
    DocumentsDashboardService,
    RoutingDashboardService,
    SystemHealthDashboardService,
    VehiclesDashboardService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
