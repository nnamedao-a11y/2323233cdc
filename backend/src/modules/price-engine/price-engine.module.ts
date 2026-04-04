/**
 * VIN Price Engine Module
 * 
 * VIN → PRICE → DECISION → MONEY
 * 
 * Компоненти:
 * - Market Estimator (оцінка ринкової ціни)
 * - Cost Calculator (всі витрати)
 * - Bid Calculator (max bid, break-even)
 * - Margin Engine (profit calculation)
 * - Decision Engine (GOOD/RISKY/BAD)
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VinPriceService } from './vin-price.service';
import { MarketEstimatorService } from './market-estimator.service';
import { BidCalculatorService } from './bid-calculator.service';
import { CostCalculatorService } from './cost-calculator.service';
import { VinPriceController } from './vin-price.controller';
import { ParsingMeshModule } from '../parsing-mesh/parsing-mesh.module';

// Schemas
import { PriceHistory, PriceHistorySchema } from './schemas/price-history.schema';
import { MarketData, MarketDataSchema } from './schemas/market-data.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PriceHistory.name, schema: PriceHistorySchema },
      { name: MarketData.name, schema: MarketDataSchema },
    ]),
    forwardRef(() => ParsingMeshModule),
  ],
  providers: [
    VinPriceService,
    MarketEstimatorService,
    BidCalculatorService,
    CostCalculatorService,
  ],
  controllers: [VinPriceController],
  exports: [VinPriceService, CostCalculatorService, BidCalculatorService],
})
export class VinPriceModule {}
