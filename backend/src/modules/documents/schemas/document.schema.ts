import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument } from 'mongoose';
import { generateId } from '../../../shared/utils';
import { DocumentType, DocumentStatus } from '../enums/document.enum';

@Schema({ timestamps: true })
export class Document extends MongoDocument {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ type: String, enum: Object.values(DocumentType), required: true })
  type: DocumentType;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  // Entity bindings
  @Prop({ index: true })
  customerId?: string;

  @Prop({ index: true })
  leadId?: string;

  @Prop({ index: true })
  dealId?: string;

  @Prop({ index: true })
  depositId?: string;

  // Files attached to this document
  @Prop({ type: [String], default: [] })
  fileIds: string[];

  @Prop({ type: String, enum: Object.values(DocumentStatus), default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  // Verification
  @Prop()
  verifiedBy?: string;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  rejectionReason?: string;

  @Prop()
  notes?: string;

  // Audit
  @Prop({ required: true })
  createdBy: string;

  @Prop()
  updatedBy?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(Document);

// Indexes
DocumentSchema.index({ type: 1, status: 1 });
DocumentSchema.index({ customerId: 1, type: 1 });
DocumentSchema.index({ dealId: 1, type: 1 });
DocumentSchema.index({ depositId: 1 });
DocumentSchema.index({ status: 1, createdAt: -1 });
DocumentSchema.index({ isDeleted: 1 });
