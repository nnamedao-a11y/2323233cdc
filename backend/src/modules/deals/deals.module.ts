import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { Deal, DealSchema } from './deal.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { Quote, QuoteSchema } from '../calculator/schemas/quote.schema';
import { BlueprintModule } from '../blueprint/blueprint.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Deal.name, schema: DealSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'Quote', schema: QuoteSchema },
    ]),
    forwardRef(() => BlueprintModule),
  ],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
