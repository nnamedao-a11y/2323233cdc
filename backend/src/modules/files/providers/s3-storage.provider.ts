import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { 
  StorageProvider, 
  StorageUploadParams, 
  StorageUploadResult 
} from '../interfaces/storage-provider.interface';
import { generateId } from '../../../shared/utils';
import * as path from 'path';

/**
 * S3 Storage Provider
 * For production use with any S3-compatible storage
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'crm-files';
    this.region = process.env.S3_REGION || 'eu-central-1';

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      endpoint: process.env.S3_ENDPOINT, // For S3-compatible services
      forcePathStyle: !!process.env.S3_ENDPOINT, // Required for MinIO etc.
    });

    this.logger.log(`S3 Provider initialized: bucket=${this.bucket}, region=${this.region}`);
  }

  async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    const { buffer, fileName, mimeType, folder } = params;

    // Generate unique filename
    const ext = path.extname(fileName);
    const uniqueName = `${generateId()}${ext}`;
    const storageKey = folder ? `${folder}/${uniqueName}` : uniqueName;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.client.send(command);

    this.logger.log(`File uploaded to S3: ${storageKey} (${buffer.length} bytes)`);

    return {
      storageKey,
      bucket: this.bucket,
      provider: 's3',
      size: buffer.length,
      mimeType,
    };
  }

  async getSignedUrl(storageKey: string, expiresInSec: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSec,
    });

    return signedUrl;
  }

  async delete(storageKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    await this.client.send(command);
    this.logger.log(`File deleted from S3: ${storageKey}`);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}
