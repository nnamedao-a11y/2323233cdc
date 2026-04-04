/**
 * Redis Module
 * 
 * Production-ready Redis integration with fallback
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';

export const REDIS_SERVICE = 'REDIS_SERVICE';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    {
      provide: REDIS_SERVICE,
      useExisting: RedisService,
    },
  ],
  exports: [RedisService, REDIS_SERVICE],
})
export class RedisModule {}
