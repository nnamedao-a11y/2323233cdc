import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider } from '../interfaces/storage-provider.interface';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

export type StorageType = 'local' | 's3';

/**
 * Storage Provider Factory
 * Returns appropriate storage provider based on configuration
 */
@Injectable()
export class StorageProviderFactory {
  private readonly logger = new Logger(StorageProviderFactory.name);
  private readonly providers: Map<StorageType, StorageProvider> = new Map();

  constructor(
    private readonly localProvider: LocalStorageProvider,
    private readonly s3Provider: S3StorageProvider,
  ) {
    this.providers.set('local', localProvider);
    this.providers.set('s3', s3Provider);
  }

  /**
   * Get storage provider based on type or environment configuration
   */
  getProvider(type?: StorageType): StorageProvider {
    const providerType = type || this.getDefaultProviderType();
    const provider = this.providers.get(providerType);

    if (!provider) {
      this.logger.warn(`Provider ${providerType} not found, falling back to local`);
      return this.localProvider;
    }

    return provider;
  }

  /**
   * Get default provider type from environment
   */
  private getDefaultProviderType(): StorageType {
    const configuredType = process.env.STORAGE_PROVIDER as StorageType;
    
    if (configuredType && this.providers.has(configuredType)) {
      return configuredType;
    }

    // Default to local in development, S3 in production
    return process.env.NODE_ENV === 'production' ? 's3' : 'local';
  }

  /**
   * Get local storage provider directly (for file serving)
   */
  getLocalProvider(): LocalStorageProvider {
    return this.localProvider;
  }
}
