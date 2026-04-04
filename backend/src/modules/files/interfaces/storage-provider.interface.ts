/**
 * Storage Provider Interface
 * Abstract interface for file storage operations
 */
export interface StorageUploadParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folder?: string;
}

export interface StorageUploadResult {
  storageKey: string;
  bucket?: string;
  provider: 's3' | 'local';
  size: number;
  mimeType: string;
  url?: string;
}

export interface StorageProvider {
  /**
   * Upload file to storage
   */
  upload(params: StorageUploadParams): Promise<StorageUploadResult>;

  /**
   * Generate a signed/temporary URL for file access
   */
  getSignedUrl(storageKey: string, expiresInSec?: number): Promise<string>;

  /**
   * Delete file from storage
   */
  delete(storageKey: string): Promise<void>;

  /**
   * Check if file exists
   */
  exists(storageKey: string): Promise<boolean>;
}

/**
 * File context for access control
 */
export interface FileContext {
  entityType?: 'lead' | 'customer' | 'deal' | 'deposit' | 'document';
  entityId?: string;
  uploadedBy: string;
  access: 'private' | 'restricted' | 'public';
}

/**
 * Allowed MIME types for upload
 */
export const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

/**
 * Blocked extensions for security
 */
export const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.sh', '.cmd', '.ps1',
  '.js', '.ts', '.php', '.py', '.rb',
  '.dll', '.so', '.dylib',
  '.msi', '.dmg', '.pkg',
];

/**
 * Max file size in bytes (10MB default)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
