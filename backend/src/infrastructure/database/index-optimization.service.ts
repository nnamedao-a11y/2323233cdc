/**
 * MongoDB Index Optimization Script
 * 
 * Creates compound indexes for frequently used aggregation queries:
 * - Leads stats
 * - Deals pipeline
 * - Staff performance
 * - Contracts accounting
 * - Invoices analytics
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class IndexOptimizationService implements OnModuleInit {
  private readonly logger = new Logger(IndexOptimizationService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async onModuleInit() {
    await this.createIndexes();
  }

  async createIndexes(): Promise<void> {
    this.logger.log('Creating optimized MongoDB indexes...');
    
    const db = this.connection.db;
    if (!db) {
      this.logger.warn('Database connection not ready, skipping index creation');
      return;
    }

    try {
      // === USERS COLLECTION ===
      await this.createIndexSafe(db, 'users', [
        { key: { id: 1 }, unique: true },
        { key: { email: 1 }, unique: true },
        { key: { role: 1, isActive: 1, isDeleted: 1 } },
        { key: { teamLeadId: 1, role: 1, isActive: 1 } },
        { key: { role: 1, lastLoginAt: -1 } },
      ]);

      // === LEADS COLLECTION ===
      await this.createIndexSafe(db, 'leads', [
        { key: { id: 1 }, unique: true },
        { key: { managerId: 1, createdAt: -1 } },
        { key: { status: 1, createdAt: -1 } },
        { key: { source: 1, createdAt: -1 } },
        { key: { managerId: 1, status: 1, createdAt: -1 } }, // Compound for stats
        { key: { createdAt: -1 } },
        { key: { convertedAt: -1 } },
      ]);

      // === DEALS COLLECTION ===
      await this.createIndexSafe(db, 'deals', [
        { key: { id: 1 }, unique: true },
        { key: { managerId: 1, createdAt: -1 } },
        { key: { status: 1, createdAt: -1 } },
        { key: { stage: 1, createdAt: -1 } },
        { key: { managerId: 1, status: 1, createdAt: -1 } }, // Compound for stats
        { key: { wonAt: -1 } },
        { key: { value: -1, status: 1 } },
      ]);

      // === CONTRACTS COLLECTION ===
      await this.createIndexSafe(db, 'contracts', [
        { key: { id: 1 }, unique: true },
        { key: { managerId: 1, createdAt: -1 } },
        { key: { status: 1, createdAt: -1 } },
        { key: { customerId: 1, createdAt: -1 } },
        { key: { signedAt: -1 } },
        { key: { status: 1, signedAt: -1 } }, // For accounting queries
        { key: { totalAmount: -1, status: 1 } },
      ]);

      // === INVOICES COLLECTION ===
      await this.createIndexSafe(db, 'invoices', [
        { key: { id: 1 }, unique: true },
        { key: { managerId: 1, createdAt: -1 } },
        { key: { status: 1, dueDate: 1 } }, // For overdue queries
        { key: { customerId: 1, createdAt: -1 } },
        { key: { paidAt: -1 } },
        { key: { status: 1, createdAt: -1 } },
      ]);

      // === SHIPMENTS COLLECTION ===
      await this.createIndexSafe(db, 'shipments', [
        { key: { id: 1 }, unique: true },
        { key: { managerId: 1, createdAt: -1 } },
        { key: { status: 1, estimatedDelivery: 1 } },
        { key: { status: 1, lastUpdate: -1 } },
        { key: { contractId: 1 } },
      ]);

      // === TASKS COLLECTION ===
      await this.createIndexSafe(db, 'tasks', [
        { key: { id: 1 }, unique: true },
        { key: { assignedTo: 1, dueDate: 1 } },
        { key: { status: 1, dueDate: 1 } },
        { key: { assignedTo: 1, status: 1, dueDate: 1 } },
      ]);

      // === ESCALATIONS COLLECTION ===
      await this.createIndexSafe(db, 'escalations', [
        { key: { id: 1 }, unique: true },
        { key: { status: 1, priority: -1, createdAt: -1 } },
        { key: { assignedTo: 1, status: 1 } },
        { key: { entityType: 1, entityId: 1 } },
      ]);

      // === NOTIFICATIONS COLLECTION ===
      await this.createIndexSafe(db, 'notifications', [
        { key: { userId: 1, read: 1, createdAt: -1 } },
        { key: { userId: 1, createdAt: -1 } },
      ]);

      // === ACTIVITY LOGS COLLECTION ===
      await this.createIndexSafe(db, 'activitylogs', [
        { key: { userId: 1, createdAt: -1 } },
        { key: { entityType: 1, entityId: 1, createdAt: -1 } },
        { key: { action: 1, createdAt: -1 } },
      ]);

      // === AUDIT LOGS COLLECTION ===
      await this.createIndexSafe(db, 'auditlogs', [
        { key: { userId: 1, createdAt: -1 } },
        { key: { entityType: 1, entityId: 1 } },
        { key: { action: 1, createdAt: -1 } },
      ]);

      // === STAFF SESSIONS COLLECTION ===
      await this.createIndexSafe(db, 'staffsessions', [
        { key: { userId: 1, isActive: 1, createdAt: -1 } },
        { key: { isActive: 1, lastActivityAt: -1 } },
      ]);

      this.logger.log('✅ MongoDB indexes created successfully');
    } catch (error) {
      this.logger.error(`Failed to create indexes: ${error.message}`);
    }
  }

  private async createIndexSafe(
    db: any, 
    collectionName: string, 
    indexes: Array<{ key: Record<string, number>; unique?: boolean }>
  ): Promise<void> {
    try {
      const collection = db.collection(collectionName);
      
      for (const index of indexes) {
        try {
          await collection.createIndex(index.key, { 
            unique: index.unique || false,
            background: true,
          });
        } catch (e) {
          // Index might already exist, ignore
          if (!e.message.includes('already exists')) {
            this.logger.warn(`Index creation warning for ${collectionName}: ${e.message}`);
          }
        }
      }
      
      this.logger.debug(`Indexes created for ${collectionName}`);
    } catch (error) {
      this.logger.warn(`Could not create indexes for ${collectionName}: ${error.message}`);
    }
  }
}
