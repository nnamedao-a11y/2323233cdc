import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResponseTime, ResponseTimeSchema } from './response-time.schema';
import { ResponseTimeService } from './response-time.service';
import { ResponseTimeController } from './response-time.controller';
import { CacheModule } from '../../infrastructure/cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ResponseTime.name, schema: ResponseTimeSchema },
    ]),
    CacheModule,
  ],
  controllers: [ResponseTimeController],
  providers: [ResponseTimeService],
  exports: [ResponseTimeService],
})
export class ResponseTimeModule {}
