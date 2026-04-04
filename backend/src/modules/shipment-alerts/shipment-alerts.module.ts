/**
 * Shipment Alerts Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ShipmentAlertsController } from './shipment-alerts.controller';
import { ShipmentAlertsService } from './shipment-alerts.service';
import { ShipmentAlertLog, ShipmentAlertLogSchema } from './shipment-alert-log.schema';
import { Shipment, ShipmentSchema } from '../shipping/shipment.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: ShipmentAlertLog.name, schema: ShipmentAlertLogSchema },
      { name: Shipment.name, schema: ShipmentSchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [ShipmentAlertsController],
  providers: [ShipmentAlertsService],
  exports: [ShipmentAlertsService],
})
export class ShipmentAlertsModule {}
