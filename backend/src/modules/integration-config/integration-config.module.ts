/**
 * Integration Config Module
 */

import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { IntegrationConfigService } from './integration-config.service';
import { IntegrationConfigController, SystemHealthController } from './integration-config.controller';
import { IntegrationConfig, IntegrationConfigSchema } from './schemas/integration-config.schema';
import { EncryptionService } from './encryption.service';
import { SystemErrorModule } from '../system-errors/system-error.module';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: IntegrationConfig.name, schema: IntegrationConfigSchema },
    ]),
    SystemErrorModule,
  ],
  controllers: [IntegrationConfigController, SystemHealthController],
  providers: [IntegrationConfigService, EncryptionService],
  exports: [IntegrationConfigService, EncryptionService],
})
export class IntegrationConfigModule {}
