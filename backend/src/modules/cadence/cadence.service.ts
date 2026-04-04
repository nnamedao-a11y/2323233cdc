/**
 * BIBI Cars - Cadence Service
 * Zoho-style follow-up automation engine
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventBusService } from '../event-bus/event-bus.service';
import { EventTypes } from '../../common/events/system-event.interface';
import { Cadence, CadenceDocument, CadenceStep } from './schemas/cadence.schema';
import { CadenceRun, CadenceRunDocument } from './schemas/cadence-run.schema';
import { CadenceExecutionLog, CadenceExecutionLogDocument } from './schemas/cadence-execution-log.schema';
import { ALL_CADENCES, CadenceDefinition } from './cadence.definitions';

@Injectable()
export class CadenceService {
  private readonly logger = new Logger(CadenceService.name);

  constructor(
    @InjectModel(Cadence.name) private cadenceModel: Model<CadenceDocument>,
    @InjectModel(CadenceRun.name) private runModel: Model<CadenceRunDocument>,
    @InjectModel(CadenceExecutionLog.name) private logModel: Model<CadenceExecutionLogDocument>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Invoice') private invoiceModel: Model<any>,
    @InjectModel('Shipment') private shipmentModel: Model<any>,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Start a cadence for an entity
   */
  async startCadence(input: {
    cadenceCode: string;
    entityType: string;
    entityId: string;
    triggerEvent: string;
  }): Promise<CadenceRunDocument | null> {
    // Check if already running
    const existing = await this.runModel.findOne({
      cadenceCode: input.cadenceCode,
      entityId: input.entityId,
      status: 'active',
    });

    if (existing) {
      this.logger.log(`Cadence ${input.cadenceCode} already active for ${input.entityId}`);
      return existing;
    }

    // Get cadence definition
    const cadence = await this.getCadenceByCode(input.cadenceCode);
    if (!cadence || !cadence.isActive) {
      this.logger.log(`Cadence ${input.cadenceCode} not found or inactive`);
      return null;
    }

    // Calculate first execution time
    const firstStep = cadence.steps?.[0];
    const nextExecutionAt = firstStep
      ? new Date(Date.now() + firstStep.delayMinutes * 60 * 1000)
      : new Date();

    // Create run
    const run = await this.runModel.create({
      cadenceCode: input.cadenceCode,
      entityType: input.entityType,
      entityId: input.entityId,
      triggerEvent: input.triggerEvent,
      status: 'active',
      lastExecutedStep: 0,
      nextExecutionAt,
    });

    this.logger.log(`Cadence ${input.cadenceCode} started for ${input.entityType}:${input.entityId}`);

    await this.eventBus.emit({
      type: 'cadence.started',
      aggregateType: input.entityType,
      aggregateId: input.entityId,
      payload: {
        cadenceCode: input.cadenceCode,
        entityId: input.entityId,
        runId: run._id?.toString(),
      },
      actorType: 'system',
      source: 'cron',
    });

    return run;
  }

  /**
   * Stop a cadence
   */
  async stopCadence(cadenceCode: string, entityId: string, reason: string): Promise<void> {
    await this.runModel.updateMany(
      { cadenceCode, entityId, status: 'active' },
      {
        $set: {
          status: 'stopped',
          stoppedReason: reason,
          nextExecutionAt: null,
        },
      }
    );

    this.logger.log(`Cadence ${cadenceCode} stopped for ${entityId}: ${reason}`);
  }

  /**
   * Execute all due cadence runs (called by cron)
   */
  async executeDueRuns(): Promise<void> {
    const now = new Date();
    
    const dueRuns = await this.runModel.find({
      status: 'active',
      nextExecutionAt: { $lte: now },
    }).limit(100);

    this.logger.log(`Processing ${dueRuns.length} due cadence runs`);

    for (const run of dueRuns) {
      try {
        await this.executeRun(run);
      } catch (err) {
        this.logger.error(`Failed to execute cadence run ${run._id}`, err);
      }
    }
  }

  /**
   * Execute a single cadence run
   */
  async executeRun(run: CadenceRunDocument): Promise<void> {
    const cadence = await this.getCadenceByCode(run.cadenceCode);
    if (!cadence || !cadence.isActive) {
      await this.stopRun(run, 'cadence_inactive');
      return;
    }

    // Get entity
    const entity = await this.getEntity(run.entityType, run.entityId);
    if (!entity) {
      await this.stopRun(run, 'entity_not_found');
      return;
    }

    // Check stop conditions
    const shouldStop = await this.checkStopConditions(entity, run.entityType, cadence.stopConditions || []);
    if (shouldStop) {
      await this.stopRun(run, 'stop_condition_matched');
      return;
    }

    // Find next step
    const nextStep = cadence.steps?.find((s: CadenceStep) => s.stepOrder === run.lastExecutedStep + 1);
    if (!nextStep) {
      await this.completeRun(run);
      return;
    }

    // Execute step
    try {
      await this.executeStep(run, entity, nextStep);

      // Update run
      run.lastExecutedStep = nextStep.stepOrder;

      // Find upcoming step
      const upcomingStep = cadence.steps?.find((s: CadenceStep) => s.stepOrder === nextStep.stepOrder + 1);

      if (upcomingStep) {
        run.nextExecutionAt = new Date(Date.now() + upcomingStep.delayMinutes * 60 * 1000);
        run.status = 'active';
      } else {
        run.status = 'completed';
        run.nextExecutionAt = undefined;
      }

      await run.save();
    } catch (err: any) {
      await this.logExecution(run, nextStep, 'failed', err.message);
      run.status = 'failed';
      await run.save();
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(run: CadenceRunDocument, entity: any, step: CadenceStep): Promise<void> {
    const baseEvent = {
      aggregateType: run.entityType,
      aggregateId: run.entityId,
      actorType: 'system' as const,
      source: 'cron' as const,
    };

    switch (step.actionType) {
      case 'task':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.TASK_CREATED,
          payload: {
            ...step.payload,
            entityId: run.entityId,
            entityType: run.entityType,
            managerId: entity.managerId || entity.assignedTo,
            cadenceCode: run.cadenceCode,
          },
        });
        break;

      case 'alert':
        await this.eventBus.emit({
          ...baseEvent,
          type: step.payload.eventType || EventTypes.ALERT_SENT,
          payload: {
            ...step.payload,
            entityId: run.entityId,
            entityType: run.entityType,
            cadenceCode: run.cadenceCode,
          },
        });
        break;

      case 'telegram':
        await this.eventBus.emit({
          ...baseEvent,
          type: 'notification.telegram_requested',
          payload: {
            template: step.payload.template,
            message: step.payload.message,
            entityId: run.entityId,
            entityType: run.entityType,
            managerId: entity.managerId || entity.assignedTo,
          },
        });
        break;

      case 'email':
        await this.eventBus.emit({
          ...baseEvent,
          type: 'notification.email_requested',
          payload: {
            template: step.payload.template,
            entityId: run.entityId,
            entityType: run.entityType,
          },
        });
        break;

      case 'tag':
        await this.eventBus.emit({
          ...baseEvent,
          type: 'entity.tag_added',
          payload: { tag: step.payload.tag },
        });
        break;
    }

    await this.logExecution(run, step, 'success');
    this.logger.log(`Cadence ${run.cadenceCode} step ${step.stepOrder} executed for ${run.entityId}`);
  }

  /**
   * Check stop conditions
   */
  private async checkStopConditions(entity: any, entityType: string, conditions: string[]): Promise<boolean> {
    for (const c of conditions) {
      switch (c) {
        case 'lead_contacted':
          if (entity.lastContactAt || entity.firstContactAt) return true;
          break;

        case 'deal_created':
          if (entityType === 'lead' && entity.convertedToCustomerId) return true;
          break;

        case 'lead_lost':
          if (entity.status === 'lost') return true;
          break;

        case 'invoice_paid':
          if (entity.status === 'paid') return true;
          break;

        case 'invoice_cancelled':
          if (entity.status === 'cancelled') return true;
          break;

        case 'contract_signed':
          if (entity.contractSigned === true) return true;
          break;

        case 'deal_lost':
          if (entity.stage === 'CLOSED_LOST') return true;
          break;

        case 'shipment_status_changed':
          if (entity.currentStatus && entity.currentStatus !== entity.previousStatus) return true;
          break;

        case 'shipment_synced':
          const recentSync = entity.lastSyncAt && (Date.now() - new Date(entity.lastSyncAt).getTime()) < 3600000;
          if (recentSync) return true;
          break;

        case 'shipment_delivered':
          if (entity.currentStatus === 'DELIVERED') return true;
          break;
      }
    }

    return false;
  }

  private async completeRun(run: CadenceRunDocument): Promise<void> {
    run.status = 'completed';
    run.nextExecutionAt = undefined;
    await run.save();
    this.logger.log(`Cadence ${run.cadenceCode} completed for ${run.entityId}`);
  }

  private async stopRun(run: CadenceRunDocument, reason: string): Promise<void> {
    run.status = 'stopped';
    run.stoppedReason = reason;
    run.nextExecutionAt = undefined;
    await run.save();
    this.logger.log(`Cadence ${run.cadenceCode} stopped for ${run.entityId}: ${reason}`);
  }

  private async getEntity(entityType: string, entityId: string): Promise<any> {
    switch (entityType) {
      case 'lead':
        return this.leadModel.findOne({ $or: [{ id: entityId }, { _id: entityId }] }).lean();
      case 'deal':
        return this.dealModel.findOne({ $or: [{ id: entityId }, { _id: entityId }] }).lean();
      case 'invoice':
        return this.invoiceModel.findOne({ $or: [{ id: entityId }, { _id: entityId }] }).lean();
      case 'shipment':
        return this.shipmentModel.findOne({ $or: [{ id: entityId }, { _id: entityId }] }).lean();
      default:
        return null;
    }
  }

  private async getCadenceByCode(code: string): Promise<CadenceDocument | CadenceDefinition | null> {
    // First try DB
    const dbCadence = await this.cadenceModel.findOne({ code, isActive: true }).lean();
    if (dbCadence) return dbCadence;

    // Fall back to definitions
    return ALL_CADENCES.find((c) => c.code === code) || null;
  }

  private async logExecution(
    run: CadenceRunDocument,
    step: CadenceStep,
    status: 'success' | 'failed' | 'skipped',
    error?: string
  ): Promise<void> {
    await this.logModel.create({
      cadenceRunId: run._id?.toString(),
      cadenceCode: run.cadenceCode,
      stepOrder: step.stepOrder,
      actionType: step.actionType,
      status,
      payload: step.payload,
      error,
    });
  }

  // ============ ADMIN METHODS ============

  async getCadences(): Promise<any[]> {
    return this.cadenceModel.find().sort({ code: 1 }).lean();
  }

  async getActiveRuns(entityType?: string, entityId?: string): Promise<any[]> {
    const filter: any = { status: 'active' };
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;

    return this.runModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async getRunLogs(runId: string): Promise<any[]> {
    return this.logModel.find({ cadenceRunId: runId }).sort({ stepOrder: 1 }).lean();
  }

  async seedCadences(): Promise<void> {
    for (const def of ALL_CADENCES) {
      await this.cadenceModel.updateOne(
        { code: def.code },
        { $set: def },
        { upsert: true }
      );
    }
    this.logger.log(`Seeded ${ALL_CADENCES.length} cadence definitions`);
  }
}
