/**
 * System Error Module
 */

import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemErrorService } from './system-error.service';
import { SystemErrorLog, SystemErrorLogSchema } from './system-error-log.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemErrorLog.name, schema: SystemErrorLogSchema },
    ]),
  ],
  providers: [SystemErrorService],
  exports: [SystemErrorService],
})
export class SystemErrorModule {}
