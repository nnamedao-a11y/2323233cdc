/**
 * Ringostat Module
 * 
 * Handles call center integration via Ringostat webhooks
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RingostatService } from './ringostat.service';
import { RingostatController } from './ringostat.controller';
import { Call, CallSchema } from './call.schema';
import { Lead, LeadSchema } from '../leads/lead.schema';
import { User, UserSchema } from '../users/user.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Call.name, schema: CallSchema },
      { name: 'Lead', schema: LeadSchema },
      { name: 'User', schema: UserSchema },
      { name: 'Customer', schema: CustomerSchema },
    ]),
    forwardRef(() => IntegrationConfigModule),
  ],
  controllers: [RingostatController],
  providers: [RingostatService],
  exports: [RingostatService],
})
export class RingostatModule {}
