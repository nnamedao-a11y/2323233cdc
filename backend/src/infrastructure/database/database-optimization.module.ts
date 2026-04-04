/**
 * Database Optimization Module
 * 
 * Provides:
 * - Connection pooling optimization
 * - Index creation
 * - Query optimization helpers
 */

import { Module, Global } from '@nestjs/common';
import { IndexOptimizationService } from './index-optimization.service';

@Global()
@Module({
  providers: [IndexOptimizationService],
  exports: [IndexOptimizationService],
})
export class DatabaseOptimizationModule {}
