import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

// Schema
import { File, FileSchema } from './schemas/file.schema';

// Services
import { FilesService } from './services/files.service';
import { FileAccessService } from './services/file-access.service';

// Providers
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { StorageProviderFactory } from './providers/storage-provider.factory';

// Controller
import { FilesController } from './controllers/files.controller';

// External modules
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: File.name, schema: FileSchema },
    ]),
    MulterModule.register({
      storage: memoryStorage(),
    }),
    AuditLogModule,
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileAccessService,
    LocalStorageProvider,
    S3StorageProvider,
    StorageProviderFactory,
  ],
  exports: [FilesService, FileAccessService],
})
export class FilesModule {}
