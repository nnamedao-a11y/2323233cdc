import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schema
import { Document, DocumentSchema } from './schemas/document.schema';

// Services
import { DocumentsService } from './services/documents.service';

// Controller
import { DocumentsController } from './controllers/documents.controller';

// External modules
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Document.name, schema: DocumentSchema },
    ]),
    FilesModule,
    NotificationsModule,
    AuditLogModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
