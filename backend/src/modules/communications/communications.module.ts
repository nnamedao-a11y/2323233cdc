import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { CommunicationsService } from './communications.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsProcessor } from './communications.processor';
import { CommunicationLog, CommunicationLogSchema } from './schemas/communication-log.schema';
import { MessageTemplate, MessageTemplateSchema } from './schemas/message-template.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { CommunicationEvent, CommunicationEventSchema } from './schemas/communication-event.schema';
import { TwilioSMSProvider } from './providers/twilio.provider';
import { ViberBusinessProvider } from './providers/viber.provider';
import { SMSProviderManager } from './providers/sms-provider.manager';
import { WebhookService } from './webhooks/webhook.service';
import { WebhookController } from './webhooks/webhook.controller';
import { TimelineService } from './timeline/timeline.service';
import { TimelineController } from './timeline/timeline.controller';
import { Lead, LeadSchema } from '../leads/lead.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommunicationLog.name, schema: CommunicationLogSchema },
      { name: MessageTemplate.name, schema: MessageTemplateSchema },
      { name: Message.name, schema: MessageSchema },
      { name: CommunicationEvent.name, schema: CommunicationEventSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
    BullModule.registerQueue({ name: 'communications' }),
    BullModule.registerQueue({ name: 'automation' }),
  ],
  controllers: [CommunicationsController, WebhookController, TimelineController],
  providers: [
    CommunicationsService,
    CommunicationsProcessor,
    TwilioSMSProvider,
    ViberBusinessProvider,
    SMSProviderManager,
    WebhookService,
    TimelineService,
  ],
  exports: [CommunicationsService, SMSProviderManager, TimelineService, WebhookService],
})
export class CommunicationsModule {}
