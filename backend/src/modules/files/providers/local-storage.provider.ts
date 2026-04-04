import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { 
  StorageProvider, 
  StorageUploadParams, 
  StorageUploadResult 
} from '../interfaces/storage-provider.interface';
import { generateId } from '../../../shared/utils';

/**
 * Local Storage Provider
 * For development and testing purposes
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;
  private readonly baseUrl: string;

  constructor() {
    this.baseDir = process.env.LOCAL_STORAGE_PATH || '/app/uploads';
    this.baseUrl = process.env.LOCAL_STORAGE_URL || '/api/files/serve';
    
    // Ensure upload directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.baseDir}`);
    }
  }

  async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    const { buffer, fileName, mimeType, folder } = params;

    // Generate unique filename
    const ext = path.extname(fileName);
    const uniqueName = `${generateId()}${ext}`;
    
    // Build storage path
    const folderPath = folder ? path.join(this.baseDir, folder) : this.baseDir;
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const storageKey = folder ? `${folder}/${uniqueName}` : uniqueName;
    const filePath = path.join(this.baseDir, storageKey);

    // Write file
    await fs.promises.writeFile(filePath, buffer);

    this.logger.log(`File uploaded: ${storageKey} (${buffer.length} bytes)`);

    return {
      storageKey,
      provider: 'local',
      size: buffer.length,
      mimeType,
      url: `${this.baseUrl}/${storageKey}`,
    };
  }

  async getSignedUrl(storageKey: string, expiresInSec: number = 3600): Promise<string> {
    // For local storage, we return a simple URL with a token
    // In production, this would be a proper signed URL
    const token = Buffer.from(`${storageKey}:${Date.now() + expiresInSec * 1000}`).toString('base64');
    return `${this.baseUrl}/${storageKey}?token=${token}`;
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(this.baseDir, storageKey);
    
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      this.logger.log(`File deleted: ${storageKey}`);
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, storageKey);
    return fs.existsSync(filePath);
  }

  /**
   * Get file path for serving
   */
  getFilePath(storageKey: string): string {
    return path.join(this.baseDir, storageKey);
  }
}
