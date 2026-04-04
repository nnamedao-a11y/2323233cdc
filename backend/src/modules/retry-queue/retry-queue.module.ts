/**
 * Retry Queue Module
 */

import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { RetryQueueService } from './retry-queue.service';
import { RetryQueue, RetryQueueSchema } from './retry-queue.schema';
import { SystemErrorModule } from '../system-errors/system-error.module';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: RetryQueue.name, schema: RetryQueueSchema },
    ]),
    SystemErrorModule,
  ],
  providers: [RetryQueueService],
  exports: [RetryQueueService],
})
export class RetryQueueModule {}
