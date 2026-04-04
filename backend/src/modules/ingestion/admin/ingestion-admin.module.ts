/**
 * Ingestion Admin Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { ParserState, ParserStateSchema } from './schemas/parser-state.schema';
import { ParserLog, ParserLogSchema } from './schemas/parser-log.schema';
import { ParserSetting, ParserSettingSchema } from './schemas/parser-setting.schema';
import { ParserAlert, ParserAlertSchema } from './schemas/parser-alert.schema';

// Repositories
import { ParserStateRepository } from './repositories/parser-state.repository';
import { ParserLogRepository } from './repositories/parser-log.repository';
import { ParserSettingRepository } from './repositories/parser-setting.repository';
import { ParserAlertRepository } from './repositories/parser-alert.repository';

// Services
import { ParserAdminService } from './services/parser-admin.service';
import { ParserHealthAdminService } from './services/parser-health-admin.service';
import { ParserControlService } from './services/parser-control.service';
import { ParserLogsService } from './services/parser-logs.service';
import { ParserAlertsService } from './services/parser-alerts.service';
import { ParserSettingsService } from './services/parser-settings.service';
import { ProxyAdminService } from './services/proxy-admin.service';

// Controllers
import { ParserAdminController } from './controllers/parser-admin.controller';
import { ProxyAdminController } from './controllers/proxy-admin.controller';

// Parent module for runners
import { IngestionModule } from '../ingestion.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParserState.name, schema: ParserStateSchema },
      { name: ParserLog.name, schema: ParserLogSchema },
      { name: ParserSetting.name, schema: ParserSettingSchema },
      { name: ParserAlert.name, schema: ParserAlertSchema },
    ]),
    forwardRef(() => IngestionModule),
  ],
  controllers: [
    ParserAdminController,
    ProxyAdminController,
  ],
  providers: [
    // Repositories
    ParserStateRepository,
    ParserLogRepository,
    ParserSettingRepository,
    ParserAlertRepository,
    
    // Services
    ParserAdminService,
    ParserHealthAdminService,
    ParserControlService,
    ParserLogsService,
    ParserAlertsService,
    ParserSettingsService,
    ProxyAdminService,
  ],
  exports: [
    ParserAdminService,
    ParserControlService,
    ParserHealthAdminService,
    ParserLogsService,
    ParserAlertsService,
    ParserStateRepository,
  ],
})
export class IngestionAdminModule {}
