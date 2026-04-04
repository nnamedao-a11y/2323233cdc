/**
 * Encryption Service
 * 
 * AES-256 encryption для sensitive data
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly authTagLength = 16;
  private readonly key: Buffer;

  constructor() {
    // Get key from env or generate deterministic one
    const envKey = process.env.ENCRYPTION_KEY;
    if (envKey && envKey.length >= 32) {
      this.key = Buffer.from(envKey.slice(0, 32), 'utf8');
    } else {
      // Fallback: derive key from JWT_SECRET
      const secret = process.env.JWT_SECRET || 'bibi_crm_default_encryption_key_2026';
      this.key = crypto.scryptSync(secret, 'bibi_salt', this.keyLength);
    }
  }

  /**
   * Encrypt a string value
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return '';
    
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decrypt a string value
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) return '';
    
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        // Not encrypted or wrong format - return as is
        return encryptedText;
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      // Return original if decryption fails (might be unencrypted legacy data)
      return encryptedText;
    }
  }

  /**
   * Encrypt an object's sensitive fields
   */
  encryptCredentials(credentials: Record<string, string>): Record<string, string> {
    const encrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      encrypted[key] = value ? this.encrypt(value) : '';
    }
    return encrypted;
  }

  /**
   * Decrypt an object's sensitive fields
   */
  decryptCredentials(credentials: Record<string, string>): Record<string, string> {
    const decrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      decrypted[key] = value ? this.decrypt(value) : '';
    }
    return decrypted;
  }

  /**
   * Mask a sensitive value for display
   * Shows first 4 and last 4 chars
   */
  maskValue(value: string): string {
    if (!value || value.length <= 8) {
      return '****';
    }
    return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`;
  }

  /**
   * Check if value is already encrypted
   */
  isEncrypted(value: string): boolean {
    if (!value) return false;
    const parts = value.split(':');
    return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
  }
}
