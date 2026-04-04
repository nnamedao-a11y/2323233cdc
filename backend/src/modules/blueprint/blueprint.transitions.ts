/**
 * BIBI Cars - Blueprint Transitions Configuration
 * Zoho Blueprint-style process control
 * 
 * Each transition defines:
 * - requiredFields: fields that MUST be filled
 * - requiredActions: actions that MUST be completed
 * - blockers: conditions that BLOCK the transition
 * - onEnterActions: automatic actions when entering stage
 */

import { BlueprintTransition } from './interfaces/blueprint-transition.interface';
import { DealStage } from './blueprint-stage.enum';

export const DEAL_BLUEPRINT_TRANSITIONS: BlueprintTransition[] = [
  // ═══════════════════════════════════════════════════════════
  // NEW_LEAD → CONTACT_ATTEMPT
  // Manager must be assigned
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.NEW_LEAD,
    to: DealStage.CONTACT_ATTEMPT,
    requiredFields: ['managerId'],
    onEnterActions: ['create_contact_task', 'start_new_lead_cadence'],
    description: 'Призначити менеджера та почати контакт',
  },

  // ═══════════════════════════════════════════════════════════
  // CONTACT_ATTEMPT → QUALIFIED
  // Must have customer and at least one call
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.CONTACT_ATTEMPT,
    to: DealStage.QUALIFIED,
    requiredFields: ['customerId'],
    requiredActions: ['at_least_one_call'],
    onEnterActions: ['recalculate_deal_score', 'stop_new_lead_cadence'],
    description: 'Клієнт кваліфікований після успішного контакту',
  },

  // ═══════════════════════════════════════════════════════════
  // QUALIFIED → CAR_SELECTED
  // VIN must be selected
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.QUALIFIED,
    to: DealStage.CAR_SELECTED,
    requiredFields: ['vin'],
    onEnterActions: ['create_vehicle_review_task', 'check_carfax_availability'],
    description: 'Авто вибрано з аукціону',
  },

  // ═══════════════════════════════════════════════════════════
  // CAR_SELECTED → NEGOTIATION
  // Lot ID must be set
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.CAR_SELECTED,
    to: DealStage.NEGOTIATION,
    requiredFields: ['lotId'],
    onEnterActions: ['notify_manager_negotiation_started', 'calculate_price_estimate'],
    description: 'Переговори щодо ціни та умов',
  },

  // ═══════════════════════════════════════════════════════════
  // NEGOTIATION → CONTRACT_SENT
  // Customer and VIN must be set
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.NEGOTIATION,
    to: DealStage.CONTRACT_SENT,
    requiredFields: ['customerId', 'vin'],
    onEnterActions: ['create_contract', 'start_contract_pending_cadence'],
    description: 'Договір надіслано клієнту',
  },

  // ═══════════════════════════════════════════════════════════
  // CONTRACT_SENT → CONTRACT_SIGNED
  // BLOCKER: Contract must be actually signed
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.CONTRACT_SENT,
    to: DealStage.CONTRACT_SIGNED,
    requiredActions: ['contract_signed'],
    blockers: ['no_signed_contract'],
    onEnterActions: ['unlock_payment', 'stop_contract_pending_cadence', 'create_payment_task'],
    description: 'Договір підписано - можна виставляти рахунок',
  },

  // ═══════════════════════════════════════════════════════════
  // CONTRACT_SIGNED → PAYMENT_PENDING
  // Invoice must be created
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.CONTRACT_SIGNED,
    to: DealStage.PAYMENT_PENDING,
    requiredActions: ['invoice_created'],
    onEnterActions: ['create_payment_followup_task', 'start_payment_cadence'],
    description: 'Рахунок виставлено, очікуємо оплату',
  },

  // ═══════════════════════════════════════════════════════════
  // PAYMENT_PENDING → PAYMENT_DONE
  // BLOCKER: Deposit must be paid
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.PAYMENT_PENDING,
    to: DealStage.PAYMENT_DONE,
    requiredActions: ['deposit_paid'],
    blockers: ['invoice_not_paid'],
    onEnterActions: ['activate_shipment_preparation', 'stop_payment_cadence', 'notify_owner_payment_received'],
    description: 'Оплата отримана - готуємо доставку',
  },

  // ═══════════════════════════════════════════════════════════
  // PAYMENT_DONE → SHIPPING
  // BLOCKER: Shipment must be created
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.PAYMENT_DONE,
    to: DealStage.SHIPPING,
    requiredActions: ['shipment_created'],
    blockers: ['shipment_not_ready'],
    onEnterActions: ['create_tracking_task', 'start_shipment_cadence', 'notify_customer_shipment_started'],
    description: 'Авто в дорозі',
  },

  // ═══════════════════════════════════════════════════════════
  // SHIPPING → DELIVERED
  // BLOCKER: Shipment must be delivered
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.SHIPPING,
    to: DealStage.DELIVERED,
    requiredActions: ['shipment_delivered'],
    blockers: ['shipment_not_delivered'],
    onEnterActions: ['close_success_journey', 'create_feedback_task', 'notify_owner_deal_completed'],
    description: 'Авто доставлено клієнту',
  },

  // ═══════════════════════════════════════════════════════════
  // ANY → CLOSED_LOST (can be called from multiple stages)
  // ═══════════════════════════════════════════════════════════
  {
    from: DealStage.CONTACT_ATTEMPT,
    to: DealStage.CLOSED_LOST,
    onEnterActions: ['close_lost_journey', 'notify_team_lead_lost'],
    description: 'Угоду втрачено',
  },
  {
    from: DealStage.QUALIFIED,
    to: DealStage.CLOSED_LOST,
    onEnterActions: ['close_lost_journey', 'notify_team_lead_lost'],
    description: 'Угоду втрачено',
  },
  {
    from: DealStage.CAR_SELECTED,
    to: DealStage.CLOSED_LOST,
    onEnterActions: ['close_lost_journey', 'notify_team_lead_lost'],
    description: 'Угоду втрачено',
  },
  {
    from: DealStage.NEGOTIATION,
    to: DealStage.CLOSED_LOST,
    onEnterActions: ['close_lost_journey', 'notify_team_lead_lost'],
    description: 'Угоду втрачено',
  },
  {
    from: DealStage.CONTRACT_SENT,
    to: DealStage.CLOSED_LOST,
    onEnterActions: ['close_lost_journey', 'notify_team_lead_lost', 'cancel_contract'],
    description: 'Угоду втрачено',
  },
];

/**
 * Get allowed transitions from a stage
 */
export function getAllowedTransitions(from: DealStage): DealStage[] {
  return DEAL_BLUEPRINT_TRANSITIONS
    .filter((t) => t.from === from)
    .map((t) => t.to);
}

/**
 * Get transition config
 */
export function getTransition(from: DealStage, to: DealStage): BlueprintTransition | undefined {
  return DEAL_BLUEPRINT_TRANSITIONS.find((t) => t.from === from && t.to === to);
}
