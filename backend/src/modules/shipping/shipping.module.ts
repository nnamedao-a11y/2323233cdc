/**
 * Shipping Module
 * 
 * Includes auto-tracking CRON for container updates via SeaRates API
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShippingController, ShipmentsAliasController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { ShippingSyncCron } from './shipping-sync.cron';
import { ShippingTrackingService } from './shipping-tracking.service';
import { 
  ManagerShippingTrackingController, 
  AdminShippingTrackingController 
} from './shipping-tracking.controller';
import { SeaRatesProvider } from './providers/searates.provider';
import { Shipment, ShipmentSchema } from './shipment.schema';
import { ShipmentEvent, ShipmentEventSchema } from './shipment-event.schema';
import { PaymentFlowModule } from '../payment-flow/payment-flow.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationConfigModule } from '../integration-config/integration-config.module';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ShipmentEvent.name, schema: ShipmentEventSchema },
    ]),
    forwardRef(() => PaymentFlowModule),
    forwardRef(() => AuthModule),
    forwardRef(() => IntegrationConfigModule),
    forwardRef(() => AlertsModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [
    ShippingController, 
    ShipmentsAliasController,
    ManagerShippingTrackingController,
    AdminShippingTrackingController,
  ],
  providers: [
    ShippingService, 
    ShippingSyncCron,
    ShippingTrackingService,
    SeaRatesProvider,
  ],
  exports: [ShippingService, ShippingTrackingService],
})
export class ShippingModule {}
