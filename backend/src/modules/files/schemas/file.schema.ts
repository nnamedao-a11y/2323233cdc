import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../../shared/utils';

export type FileAccess = 'private' | 'restricted' | 'public';
export type StorageProviderType = 's3' | 'local';
export type FileEntityType = 'lead' | 'customer' | 'deal' | 'deposit' | 'document';

@Schema({ timestamps: true })
export class File extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop()
  extension?: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({ required: true })
  storageKey: string;

  @Prop()
  bucket?: string;

  @Prop({ type: String, enum: ['s3', 'local'], default: 'local' })
  storageProvider: StorageProviderType;

  @Prop({ required: true })
  uploadedBy: string;

  // Entity binding
  @Prop({ type: Object })
  relatedTo?: {
    entityType: FileEntityType;
    entityId: string;
  };

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, enum: ['private', 'restricted', 'public'], default: 'private' })
  access: FileAccess;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Object })
  metadata?: {
    checksum?: string;
    source?: string;
    note?: string;
  };
}

export const FileSchema = SchemaFactory.createForClass(File);

// Indexes
FileSchema.index({ uploadedBy: 1 });
FileSchema.index({ 'relatedTo.entityType': 1, 'relatedTo.entityId': 1 });
FileSchema.index({ storageKey: 1 });
FileSchema.index({ isDeleted: 1 });
FileSchema.index({ tags: 1 });
