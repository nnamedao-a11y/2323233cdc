/**
 * Shipping Tracker Module
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ShippingTrackerService } from './shipping-tracker.service';
import { Shipment, ShipmentSchema } from '../shipping/shipment.schema';
import { ShipmentEvent, ShipmentEventSchema } from '../shipping/shipment-event.schema';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';
import { SystemErrorModule } from '../system-errors/system-error.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ShipmentEvent.name, schema: ShipmentEventSchema },
    ]),
    IntegrationConfigModule,
    SystemErrorModule,
    forwardRef(() => NotificationsModule),
  ],
  providers: [ShippingTrackerService],
  exports: [ShippingTrackerService],
})
export class ShippingTrackerModule {}
