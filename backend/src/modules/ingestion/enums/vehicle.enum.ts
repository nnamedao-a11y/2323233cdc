// Vehicle Sources - парсери та інші джерела
export enum VehicleSource {
  COPART = 'copart',
  IAAI = 'iaai',
  MANHEIM = 'manheim',
  OTHER = 'other',
  MANUAL = 'manual',
}

// Vehicle Status
export enum VehicleStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  RESERVED = 'reserved',
  ARCHIVED = 'archived',
  PENDING = 'pending',
}

// Raw Data Processing Status
export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}
