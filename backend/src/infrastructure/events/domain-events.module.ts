import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DomainEventsService, DomainEventListeners } from './domain-events.service';
import { CustomersModule } from '../../modules/customers/customers.module';

/**
 * Domain Events Module
 * 
 * Global module for event-based orchestration
 * Provides DomainEventsService for emitting events
 * Registers DomainEventListeners for Customer 360 orchestration
 */

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
    CustomersModule,
  ],
  providers: [DomainEventsService, DomainEventListeners],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
