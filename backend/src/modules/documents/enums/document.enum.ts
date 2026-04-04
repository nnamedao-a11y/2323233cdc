export enum DocumentType {
  CONTRACT = 'contract',
  INVOICE = 'invoice',
  DEPOSIT_PROOF = 'deposit_proof',
  CLIENT_DOCUMENT = 'client_document',
  DELIVERY_DOCUMENT = 'delivery_document',
  CUSTOM = 'custom',
}

export enum DocumentStatus {
  DRAFT = 'draft',
  UPLOADED = 'uploaded',
  PENDING_VERIFICATION = 'pending_verification',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}
