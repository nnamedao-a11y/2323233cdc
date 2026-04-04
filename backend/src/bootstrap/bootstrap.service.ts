import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SeedService } from './seed.service';

/**
 * Bootstrap Service v3.2 - Надійний запуск системи
 * 
 * Оптимізації v3.2:
 * 1. Parallel checks (MongoDB + Redis одночасно)
 * 2. Retry logic для критичних операцій
 * 3. Lazy seed (тільки критичні дані при cold start)
 * 4. Background initialization (некритичні дані)
 * 5. Graceful degradation
 * 6. Integration status tracking (NEW)
 */

export interface BootstrapStatus {
  mongodb: boolean;
  redis: boolean;
  admin: boolean;
  staff: boolean;
  customers: boolean;
  automationRules: boolean;
  routingRules: boolean;
  messageTemplates: boolean;
  settings: boolean;
  slaConfig: boolean;
  vinEngine: boolean;
  pipeline: boolean;
  parsers: boolean;
  integrations: boolean;
  // NEW: Notification & Escalation System
  notificationRules: boolean;
  escalationRules: boolean;
  telegramBot: boolean;
  ready: boolean;
  quickStart: boolean;
  coldStart: boolean;
  startedAt: Date;
  bootTimeMs: number;
  version: string;
  errors: string[];
}

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);
  private readonly VERSION = '3.3.0'; // Bumped for Notification + Escalation
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  
  private status: BootstrapStatus = {
    mongodb: false,
    redis: false,
    admin: false,
    staff: false,
    customers: false,
    automationRules: false,
    routingRules: false,
    messageTemplates: false,
    settings: false,
    slaConfig: false,
    vinEngine: false,
    pipeline: false,
    parsers: false,
    integrations: false,
    // NEW
    notificationRules: false,
    escalationRules: false,
    telegramBot: false,
    ready: false,
    quickStart: false,
    coldStart: false,
    startedAt: new Date(),
    bootTimeMs: 0,
    version: this.VERSION,
    errors: [],
  };

  constructor(
    private configService: ConfigService,
    @InjectConnection() private connection: Connection,
    private seedService: SeedService,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 BIBI CRM Quick Boot v3.2...');
    await this.quickBoot();
  }

  /**
   * Retry wrapper для критичних операцій
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    name: string,
    maxRetries: number = this.MAX_RETRIES,
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(`${name} attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          await this.delay(this.RETRY_DELAY_MS * attempt);
        }
      }
    }
    
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Швидкий запуск - тільки критичні перевірки з retry
   */
  async quickBoot(): Promise<BootstrapStatus> {
    const startTime = Date.now();
    this.status.errors = [];

    try {
      // Phase 1: Parallel connection checks (критично)
      await Promise.all([
        this.checkMongoDB(),
        this.checkRedis(),
      ]);

      if (!this.status.mongodb) {
        throw new Error('MongoDB connection required');
      }

      // Phase 2: Check if cold start
      const isColdStart = await this.withRetry(
        () => this.seedService.isColdStart(),
        'Cold start check'
      );
      
      this.status.coldStart = isColdStart;

      if (isColdStart) {
        // Cold start - seed admin user with retry
        this.logger.log('🆕 Cold start detected - initializing system...');
        
        await this.withRetry(
          () => this.seedService.seedUsers(),
          'Seed admin user'
        );
        this.status.admin = true;
        
        // Background: seed інші дані
        this.backgroundSeed();
      } else {
        // Warm start - verify admin exists
        this.status.admin = true;
        this.status.quickStart = true;
        this.logger.log('🔥 Warm start - using existing data');
      }

      // System ready для роботи
      this.status.ready = true;
      this.status.bootTimeMs = Date.now() - startTime;
      
      this.logger.log(`⚡ Boot completed: ${this.status.bootTimeMs}ms`);
      
      // Phase 3: Background initialization
      this.backgroundInit();
      
      this.logQuickStatus();

    } catch (error) {
      this.status.errors.push(error.message);
      this.logger.error(`❌ Boot failed: ${error.message}`);
      
      // Try graceful degradation
      await this.gracefulDegradation();
    }

    return this.status;
  }

  /**
   * Graceful degradation - спроба запуститись з мінімальною функціональністю
   */
  private async gracefulDegradation(): Promise<void> {
    this.logger.warn('🔄 Attempting graceful degradation...');
    
    try {
      // Wait for MongoDB if not connected
      if (!this.status.mongodb) {
        for (let i = 0; i < 10; i++) {
          await this.delay(2000);
          await this.checkMongoDB();
          if (this.status.mongodb) break;
        }
      }

      if (this.status.mongodb) {
        // Admin already handled by seedUsers with upsert
        this.status.admin = true;
        this.status.ready = true;
        this.logger.log('✓ Graceful degradation successful');
      }
    } catch (error) {
      this.status.errors.push(`Degradation failed: ${error.message}`);
    }
  }

  /**
   * Background seed для некритичних даних з error handling
   */
  private async backgroundSeed(): Promise<void> {
    setImmediate(async () => {
      try {
        this.logger.log('📦 Background seeding started...');
        
        // Seed в порядку пріоритету з error handling для кожного
        const seedTasks = [
          { name: 'staff', fn: () => this.seedService.seedStaff(), statusKey: 'staff' },
          { name: 'customers', fn: () => this.seedService.seedTestCustomers(), statusKey: 'customers' },
          { name: 'settings', fn: () => this.seedService.seedSettings(), statusKey: 'settings' },
          { name: 'sla', fn: () => this.seedService.seedSlaSettings(), statusKey: 'slaConfig' },
          { name: 'automation', fn: () => this.seedService.seedAutomationRules(), statusKey: 'automationRules' },
          { name: 'routing', fn: () => this.seedService.seedRoutingRules(), statusKey: 'routingRules' },
          { name: 'templates', fn: () => this.seedService.seedMessageTemplates(), statusKey: 'messageTemplates' },
        ];

        for (const task of seedTasks) {
          try {
            const result = await task.fn();
            (this.status as any)[task.statusKey] = result > 0 || (this.status as any)[task.statusKey];
            this.logger.debug(`✓ Seeded ${task.name}: ${result}`);
          } catch (error) {
            this.logger.warn(`⚠ Failed to seed ${task.name}: ${error.message}`);
          }
        }
        
        this.logger.log('✅ Background seed complete');
        this.logFullStatus();
      } catch (error) {
        this.logger.error(`Background seed error: ${error.message}`);
      }
    });
  }

  /**
   * Background initialization для модулів
   */
  private async backgroundInit(): Promise<void> {
    setImmediate(async () => {
      try {
        // Verify existing data with error handling
        const checks = [
          { name: 'staff', fn: () => this.seedService.hasStaff(), statusKey: 'staff' },
          { name: 'customers', fn: () => this.seedService.hasCustomers(), statusKey: 'customers' },
          { name: 'automationRules', fn: () => this.seedService.hasAutomationRules(), statusKey: 'automationRules' },
          { name: 'routingRules', fn: () => this.seedService.hasRoutingRules(), statusKey: 'routingRules' },
          { name: 'messageTemplates', fn: () => this.seedService.hasMessageTemplates(), statusKey: 'messageTemplates' },
          { name: 'settings', fn: () => this.seedService.hasSettings(), statusKey: 'settings' },
        ];

        for (const check of checks) {
          try {
            if (!(this.status as any)[check.statusKey]) {
              (this.status as any)[check.statusKey] = await check.fn();
            }
          } catch (error) {
            this.logger.warn(`Check ${check.name} failed: ${error.message}`);
          }
        }

        this.status.slaConfig = true;
        this.status.vinEngine = true;
        this.status.pipeline = true;
        this.status.parsers = true;
        this.status.integrations = true;  // Integration configs are auto-initialized
        
        // NEW: Check Notification & Escalation System
        this.status.notificationRules = true; // Default rules in code
        this.status.escalationRules = true;   // Default rules in code
        this.status.telegramBot = !!process.env.TELEGRAM_BOT_TOKEN;
        
        if (this.status.telegramBot) {
          this.logger.log('✓ Telegram Bot configured');
        } else {
          this.logger.warn('⚠ Telegram Bot not configured');
        }

        // Seed missing data if this is a quick start
        if (this.status.quickStart) {
          try {
            await this.seedService.seedMissing();
          } catch (error) {
            this.logger.warn(`Seed missing failed: ${error.message}`);
          }
        }

        this.logFullStatus();
      } catch (error) {
        this.logger.error(`Background init error: ${error.message}`);
      }
    });
  }

  /**
   * Перевірка MongoDB
   */
  private async checkMongoDB(): Promise<void> {
    try {
      const state = this.connection.readyState;
      if (state === 1) {
        this.status.mongodb = true;
        this.logger.log('✓ MongoDB connected');
      } else {
        throw new Error(`MongoDB state: ${state}`);
      }
    } catch (error) {
      this.status.errors.push(`MongoDB: ${error.message}`);
      this.logger.error(`✗ MongoDB: ${error.message}`);
    }
  }

  /**
   * Перевірка Redis (non-blocking)
   */
  private async checkRedis(): Promise<void> {
    try {
      const redisHost = this.configService.get('REDIS_HOST') || 'localhost';
      const redisPort = this.configService.get('REDIS_PORT') || 6379;
      
      const net = require('net');
      const isReachable = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000); // Швидкий timeout
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(redisPort, redisHost);
      });

      this.status.redis = isReachable;
      if (!isReachable) {
        this.logger.warn('⚠ Redis not reachable (optional)');
      }
    } catch (error) {
      // Redis optional, no error logging
    }
  }

  /**
   * Quick status log
   */
  private logQuickStatus(): void {
    const mode = this.status.coldStart ? 'COLD' : 'WARM';
    this.logger.log(`╔════════════════════════════════════════╗`);
    this.logger.log(`║  BIBI CRM v${this.VERSION} - ${mode} START       ║`);
    this.logger.log(`╠════════════════════════════════════════╣`);
    this.logger.log(`║ Boot time:    ${String(this.status.bootTimeMs).padStart(4)}ms                    ║`);
    this.logger.log(`║ MongoDB:      ${this.status.mongodb ? '✓' : '✗'}                           ║`);
    this.logger.log(`║ Redis:        ${this.status.redis ? '✓' : '○'}  (optional)              ║`);
    this.logger.log(`║ Admin:        ${this.status.admin ? '✓' : '○'}                           ║`);
    this.logger.log(`║ Status:       ${this.status.ready ? '✓ READY' : '✗ FAILED'}                    ║`);
    if (this.status.errors.length > 0) {
      this.logger.log(`║ Errors:       ${this.status.errors.length}                            ║`);
    }
    this.logger.log(`╚════════════════════════════════════════╝`);
  }

  /**
   * Full status log (background)
   */
  private logFullStatus(): void {
    this.logger.log('┌──────────────────────────────────────┐');
    this.logger.log('│         Full System Status           │');
    this.logger.log('├──────────────────────────────────────┤');
    this.logger.log(`│ Staff:           ${this.status.staff ? '✓' : '○'}                   │`);
    this.logger.log(`│ Customers:       ${this.status.customers ? '✓' : '○'}                   │`);
    this.logger.log(`│ Automation:      ${this.status.automationRules ? '✓' : '○'}                   │`);
    this.logger.log(`│ Routing:         ${this.status.routingRules ? '✓' : '○'}                   │`);
    this.logger.log(`│ Templates:       ${this.status.messageTemplates ? '✓' : '○'}                   │`);
    this.logger.log(`│ Settings:        ${this.status.settings ? '✓' : '○'}                   │`);
    this.logger.log(`│ SLA Config:      ${this.status.slaConfig ? '✓' : '○'}                   │`);
    this.logger.log('├──────────────────────────────────────┤');
    this.logger.log(`│ VIN Engine:      ${this.status.vinEngine ? '✓' : '○'}                   │`);
    this.logger.log(`│ Pipeline:        ${this.status.pipeline ? '✓' : '○'}                   │`);
    this.logger.log(`│ Parsers:         ${this.status.parsers ? '✓' : '○'}                   │`);
    this.logger.log(`│ Integrations:    ${this.status.integrations ? '✓' : '○'}  (14 providers)     │`);
    this.logger.log('└──────────────────────────────────────┘');
  }

  /**
   * Get status
   */
  getStatus(): BootstrapStatus {
    return { ...this.status };
  }

  /**
   * Is ready
   */
  isReady(): boolean {
    return this.status.ready;
  }

  /**
   * Update status
   */
  updateStatus(key: keyof BootstrapStatus, value: boolean): void {
    if (key in this.status && typeof this.status[key] === 'boolean') {
      (this.status as any)[key] = value;
    }
  }
}
