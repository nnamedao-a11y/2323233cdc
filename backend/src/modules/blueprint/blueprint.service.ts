/**
 * BIBI Cars - Blueprint Service
 * Zoho-style process control engine
 * 
 * Controls deal stage transitions with:
 * - Required field validation
 * - Required action validation
 * - Blocker checking
 * - Automatic on-enter actions via Event Bus
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '../event-bus/event-bus.service';
import { DealStage, DEAL_STAGE_LABELS } from './blueprint-stage.enum';
import { DEAL_BLUEPRINT_TRANSITIONS, getTransition, getAllowedTransitions } from './blueprint.transitions';
import { BlueprintValidationResult, DealContext, BlueprintTransition } from './interfaces/blueprint-transition.interface';
import { EventTypes } from '../../common/events/system-event.interface';

@Injectable()
export class BlueprintService {
  private readonly logger = new Logger(BlueprintService.name);

  constructor(
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Validate and execute stage transition
   */
  async moveStage(
    deal: DealContext,
    to: DealStage,
    actorId?: string,
    actorType: 'manager' | 'team_lead' | 'owner' | 'system' = 'manager',
  ): Promise<{ deal: DealContext; validation: BlueprintValidationResult }> {
    const from = deal.stage;

    // Check if transition is allowed
    const transition = getTransition(from, to);

    if (!transition) {
      const allowed = getAllowedTransitions(from);
      throw new BadRequestException({
        message: `Перехід ${DEAL_STAGE_LABELS[from]} → ${DEAL_STAGE_LABELS[to]} не дозволений`,
        allowedTransitions: allowed.map((s) => ({
          stage: s,
          label: DEAL_STAGE_LABELS[s],
        })),
      });
    }

    // Validate transition
    const validation = await this.validateTransition(deal, transition);

    if (!validation.ok) {
      // Emit blocked event
      await this.eventBus.emit({
        type: EventTypes.DEAL_STAGE_BLOCKED,
        aggregateType: 'deal',
        aggregateId: deal.id,
        payload: {
          from,
          to,
          validation,
          reason: this.formatBlockReason(validation),
        },
        actorType,
        actorId,
        source: 'api',
      });

      throw new BadRequestException({
        message: 'Перехід заблоковано',
        validation,
        reason: this.formatBlockReason(validation),
      });
    }

    // Update stage
    const oldStage = deal.stage;
    deal.stage = to;

    // Emit stage changed event
    await this.eventBus.emit({
      type: EventTypes.DEAL_STAGE_CHANGED,
      aggregateType: 'deal',
      aggregateId: deal.id,
      payload: {
        from: oldStage,
        to,
        dealId: deal.id,
        managerId: deal.managerId,
        customerId: deal.customerId,
      },
      actorType,
      actorId,
      source: 'api',
    });

    // Execute on-enter actions
    await this.runOnEnterActions(deal, transition.onEnterActions || [], actorId);

    // Check for special stages
    if (to === DealStage.DELIVERED) {
      await this.eventBus.emit({
        type: EventTypes.DEAL_CLOSED_WON,
        aggregateType: 'deal',
        aggregateId: deal.id,
        payload: { dealId: deal.id, managerId: deal.managerId },
        actorType: 'system',
        source: 'api',
      });
    }

    if (to === DealStage.CLOSED_LOST) {
      await this.eventBus.emit({
        type: EventTypes.DEAL_CLOSED_LOST,
        aggregateType: 'deal',
        aggregateId: deal.id,
        payload: { dealId: deal.id, managerId: deal.managerId, from: oldStage },
        actorType,
        actorId,
        source: 'api',
      });
    }

    this.logger.log(`Deal ${deal.id} moved: ${oldStage} → ${to}`);

    return { deal, validation };
  }

  /**
   * Validate transition without executing
   */
  async validateTransition(
    deal: DealContext,
    transition: BlueprintTransition,
  ): Promise<BlueprintValidationResult> {
    const missingFields: string[] = [];
    const missingActions: string[] = [];
    const blockers: string[] = [];

    // Check required fields
    for (const field of transition.requiredFields || []) {
      if (!this.checkField(deal, field)) {
        missingFields.push(field);
      }
    }

    // Check required actions
    for (const action of transition.requiredActions || []) {
      if (!this.checkRequiredAction(deal, action)) {
        missingActions.push(action);
      }
    }

    // Check blockers
    for (const blocker of transition.blockers || []) {
      if (this.checkBlocker(deal, blocker)) {
        blockers.push(blocker);
      }
    }

    const ok =
      missingFields.length === 0 &&
      missingActions.length === 0 &&
      blockers.length === 0;

    return {
      ok,
      missingFields,
      missingActions,
      blockers,
      message: ok ? 'OK' : 'Перехід заблоковано',
    };
  }

  /**
   * Get current stage info and allowed transitions
   */
  getStageInfo(currentStage: DealStage): {
    current: { stage: DealStage; label: string };
    allowed: Array<{ stage: DealStage; label: string; description?: string }>;
  } {
    const allowed = DEAL_BLUEPRINT_TRANSITIONS
      .filter((t) => t.from === currentStage)
      .map((t) => ({
        stage: t.to,
        label: DEAL_STAGE_LABELS[t.to],
        description: t.description,
      }));

    return {
      current: {
        stage: currentStage,
        label: DEAL_STAGE_LABELS[currentStage],
      },
      allowed,
    };
  }

  /**
   * Get full blueprint visualization
   */
  getFullBlueprint(): Array<{
    from: DealStage;
    fromLabel: string;
    to: DealStage;
    toLabel: string;
    requiredFields: string[];
    requiredActions: string[];
    blockers: string[];
    description?: string;
  }> {
    return DEAL_BLUEPRINT_TRANSITIONS.map((t) => ({
      from: t.from,
      fromLabel: DEAL_STAGE_LABELS[t.from],
      to: t.to,
      toLabel: DEAL_STAGE_LABELS[t.to],
      requiredFields: t.requiredFields || [],
      requiredActions: t.requiredActions || [],
      blockers: t.blockers || [],
      description: t.description,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════

  private checkField(deal: DealContext, field: string): boolean {
    const value = deal[field as keyof DealContext];
    return value !== undefined && value !== null && value !== '';
  }

  private checkRequiredAction(deal: DealContext, action: string): boolean {
    switch (action) {
      case 'at_least_one_call':
        return (deal.callCount || 0) > 0 || deal.hasCalls === true;

      case 'contract_signed':
        return deal.contractSigned === true;

      case 'invoice_created':
        return deal.invoiceCreated === true;

      case 'deposit_paid':
        return deal.depositPaid === true;

      case 'full_payment_done':
        return deal.fullPaymentDone === true;

      case 'shipment_created':
        return deal.shipmentCreated === true;

      case 'shipment_delivered':
        return deal.shipmentDelivered === true;

      case 'tracking_added':
        return deal.trackingAdded === true;

      default:
        this.logger.warn(`Unknown required action: ${action}`);
        return false;
    }
  }

  private checkBlocker(deal: DealContext, blocker: string): boolean {
    // Returns TRUE if blocker is ACTIVE (blocking)
    switch (blocker) {
      case 'no_signed_contract':
        return deal.contractSigned !== true;

      case 'invoice_not_paid':
        return deal.depositPaid !== true;

      case 'shipment_not_ready':
        return deal.shipmentCreated !== true;

      case 'shipment_not_delivered':
        return deal.shipmentDelivered !== true;

      case 'no_tracking':
        return deal.trackingAdded !== true;

      default:
        this.logger.warn(`Unknown blocker: ${blocker}`);
        return false;
    }
  }

  private formatBlockReason(validation: BlueprintValidationResult): string {
    const reasons: string[] = [];

    if (validation.missingFields.length > 0) {
      reasons.push(`Відсутні поля: ${validation.missingFields.join(', ')}`);
    }

    if (validation.missingActions.length > 0) {
      const actionLabels: Record<string, string> = {
        at_least_one_call: 'Потрібен хоча б один дзвінок',
        contract_signed: 'Договір ще не підписано',
        invoice_created: 'Рахунок ще не створено',
        deposit_paid: 'Депозит ще не оплачено',
        shipment_created: 'Доставку ще не створено',
        shipment_delivered: 'Авто ще не доставлено',
      };

      const labels = validation.missingActions.map((a) => actionLabels[a] || a);
      reasons.push(labels.join('; '));
    }

    if (validation.blockers.length > 0) {
      const blockerLabels: Record<string, string> = {
        no_signed_contract: 'Договір не підписано',
        invoice_not_paid: 'Рахунок не оплачено',
        shipment_not_ready: 'Доставка не готова',
        shipment_not_delivered: 'Авто не доставлено',
      };

      const labels = validation.blockers.map((b) => blockerLabels[b] || b);
      reasons.push(`Блокери: ${labels.join(', ')}`);
    }

    return reasons.join('. ');
  }

  private async runOnEnterActions(
    deal: DealContext,
    actions: string[],
    actorId?: string,
  ): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeOnEnterAction(deal, action, actorId);
      } catch (err) {
        this.logger.error(`Failed to execute on-enter action: ${action}`, err);
      }
    }
  }

  private async executeOnEnterAction(
    deal: DealContext,
    action: string,
    actorId?: string,
  ): Promise<void> {
    const baseEvent = {
      aggregateType: 'deal',
      aggregateId: deal.id,
      actorType: 'system' as const,
      actorId,
      source: 'api' as const,
    };

    switch (action) {
      // Task creation actions
      case 'create_contact_task':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.TASK_CREATED,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
            type: 'contact_lead',
            title: 'Зв\'язатися з клієнтом',
            priority: 'high',
          },
        });
        break;

      case 'create_vehicle_review_task':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.TASK_CREATED,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
            type: 'vehicle_review',
            title: 'Перевірити авто',
            vin: deal.vin,
            priority: 'medium',
          },
        });
        break;

      case 'create_payment_task':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.TASK_CREATED,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
            type: 'create_invoice',
            title: 'Створити рахунок',
            priority: 'high',
          },
        });
        break;

      case 'create_payment_followup_task':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.TASK_CREATED,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
            type: 'payment_followup',
            title: 'Follow-up по оплаті',
            priority: 'high',
          },
        });
        break;

      case 'create_tracking_task':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.TASK_CREATED,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
            type: 'add_tracking',
            title: 'Додати tracking ID',
            priority: 'high',
          },
        });
        break;

      case 'create_feedback_task':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.TASK_CREATED,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
            type: 'collect_feedback',
            title: 'Зібрати відгук клієнта',
            priority: 'low',
          },
        });
        break;

      // Contract/Payment actions
      case 'create_contract':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.CONTRACT_CREATE_REQUESTED,
          payload: {
            dealId: deal.id,
            customerId: deal.customerId,
            vin: deal.vin,
          },
        });
        break;

      case 'unlock_payment':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.PAYMENT_UNLOCKED,
          payload: { dealId: deal.id },
        });
        break;

      case 'cancel_contract':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.CONTRACT_FAILED,
          payload: { dealId: deal.id, reason: 'deal_lost' },
        });
        break;

      // Shipping actions
      case 'activate_shipment_preparation':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.SHIPMENT_PREPARATION_REQUESTED,
          payload: {
            dealId: deal.id,
            vin: deal.vin,
            customerId: deal.customerId,
          },
        });
        break;

      // Notification actions
      case 'notify_manager_negotiation_started':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.ALERT_NEGOTIATION_STARTED,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
          },
        });
        break;

      case 'notify_customer_shipment_started':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.SHIPMENT_TRACKING_ENABLED,
          payload: {
            dealId: deal.id,
            customerId: deal.customerId,
            shipmentId: deal.shipmentId,
          },
        });
        break;

      case 'notify_owner_payment_received':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.PAYMENT_RECEIVED,
          payload: { dealId: deal.id, managerId: deal.managerId },
        });
        break;

      case 'notify_owner_deal_completed':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.JOURNEY_DEAL_COMPLETED,
          payload: { dealId: deal.id, managerId: deal.managerId },
        });
        break;

      case 'notify_team_lead_lost':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.DEAL_CLOSED_LOST,
          payload: {
            dealId: deal.id,
            managerId: deal.managerId,
            teamLeadId: deal.teamLeadId,
          },
        });
        break;

      // Score actions
      case 'recalculate_deal_score':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.DEAL_SCORE_RECALCULATE,
          payload: { dealId: deal.id },
        });
        break;

      // Journey actions
      case 'close_success_journey':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.JOURNEY_DEAL_COMPLETED,
          payload: { dealId: deal.id, outcome: 'success' },
        });
        break;

      case 'close_lost_journey':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.JOURNEY_DEAL_COMPLETED,
          payload: { dealId: deal.id, outcome: 'lost' },
        });
        break;

      // Carfax
      case 'check_carfax_availability':
        await this.eventBus.emit({
          ...baseEvent,
          type: EventTypes.CARFAX_REQUESTED,
          payload: {
            dealId: deal.id,
            vin: deal.vin,
            autoCheck: true,
          },
        });
        break;

      // Price calculation
      case 'calculate_price_estimate':
        await this.eventBus.emit({
          ...baseEvent,
          type: 'deal.price_estimate_requested',
          payload: {
            dealId: deal.id,
            vin: deal.vin,
            lotId: deal.lotId,
          },
        });
        break;

      // Cadence actions (will be handled by Cadence Engine)
      case 'start_new_lead_cadence':
      case 'stop_new_lead_cadence':
      case 'start_contract_pending_cadence':
      case 'stop_contract_pending_cadence':
      case 'start_payment_cadence':
      case 'stop_payment_cadence':
      case 'start_shipment_cadence':
        await this.eventBus.emit({
          ...baseEvent,
          type: `cadence.${action}`,
          payload: { dealId: deal.id },
        });
        break;

      default:
        this.logger.warn(`Unknown on-enter action: ${action}`);
    }
  }
}
