/**
 * BIBI Cars - Default Cadence Definitions
 */

import { CadenceStep } from './schemas/cadence.schema';

export interface CadenceDefinition {
  code: string;
  name: string;
  triggerEvent: string;
  entityType: string;
  isActive: boolean;
  steps: CadenceStep[];
  stopConditions: string[];
  description?: string;
}

export const NO_ANSWER_CADENCE: CadenceDefinition = {
  code: 'NO_ANSWER_V1',
  name: 'No Answer Follow-up',
  triggerEvent: 'call.no_answer',
  entityType: 'lead',
  isActive: true,
  description: 'Автоматичний follow-up при недодзвоні',
  steps: [
    {
      stepOrder: 1,
      delayMinutes: 0,
      actionType: 'task',
      payload: {
        type: 'callback_attempt',
        priority: 'high',
        title: 'Передзвонити клієнту',
      },
    },
    {
      stepOrder: 2,
      delayMinutes: 120,
      actionType: 'alert',
      payload: {
        severity: 'medium',
        eventType: 'lead.callback_due',
        title: 'Час передзвонити',
      },
    },
    {
      stepOrder: 3,
      delayMinutes: 360,
      actionType: 'telegram',
      payload: {
        template: 'NO_ANSWER_FOLLOWUP',
        message: '⚠️ Lead не відповідає понад 6 годин',
      },
    },
    {
      stepOrder: 4,
      delayMinutes: 1440,
      actionType: 'alert',
      payload: {
        severity: 'high',
        eventType: 'lead.no_answer_escalation',
        title: 'ESCALATION: Lead без відповіді 24 години',
      },
    },
  ],
  stopConditions: ['lead_contacted', 'deal_created', 'lead_lost'],
};

export const PAYMENT_OVERDUE_CADENCE: CadenceDefinition = {
  code: 'PAYMENT_OVERDUE_V1',
  name: 'Payment Overdue Follow-up',
  triggerEvent: 'invoice.overdue',
  entityType: 'invoice',
  isActive: true,
  description: 'Автоматичний follow-up прострочених платежів',
  steps: [
    {
      stepOrder: 1,
      delayMinutes: 0,
      actionType: 'task',
      payload: {
        type: 'payment_followup',
        priority: 'high',
        title: 'Зв\'язатися щодо простроченої оплати',
      },
    },
    {
      stepOrder: 2,
      delayMinutes: 60,
      actionType: 'telegram',
      payload: {
        template: 'PAYMENT_OVERDUE_MANAGER',
        message: '⚠️ Рахунок прострочений понад 1 годину',
      },
    },
    {
      stepOrder: 3,
      delayMinutes: 1440,
      actionType: 'alert',
      payload: {
        severity: 'high',
        eventType: 'invoice.overdue_day_1',
        title: 'Рахунок прострочений 1 день',
      },
    },
    {
      stepOrder: 4,
      delayMinutes: 4320,
      actionType: 'alert',
      payload: {
        severity: 'critical',
        eventType: 'invoice.overdue_critical',
        title: 'CRITICAL: Рахунок прострочений 3+ дні',
      },
    },
  ],
  stopConditions: ['invoice_paid', 'invoice_cancelled'],
};

export const SHIPMENT_STALLED_CADENCE: CadenceDefinition = {
  code: 'SHIPMENT_STALLED_V1',
  name: 'Shipment Stalled Follow-up',
  triggerEvent: 'shipment.stalled',
  entityType: 'shipment',
  isActive: true,
  description: 'Автоматичний follow-up завислих доставок',
  steps: [
    {
      stepOrder: 1,
      delayMinutes: 0,
      actionType: 'task',
      payload: {
        type: 'shipment_check',
        priority: 'high',
        title: 'Перевірити shipment без оновлень',
      },
    },
    {
      stepOrder: 2,
      delayMinutes: 30,
      actionType: 'alert',
      payload: {
        severity: 'high',
        eventType: 'shipment.manager_check_required',
        title: 'Shipment потребує перевірки',
      },
    },
    {
      stepOrder: 3,
      delayMinutes: 180,
      actionType: 'telegram',
      payload: {
        template: 'SHIPMENT_STALLED_TEAMLEAD',
        message: '🚨 Shipment без оновлень понад 3 години',
      },
    },
  ],
  stopConditions: ['shipment_status_changed', 'shipment_synced', 'shipment_delivered'],
};

export const CONTRACT_PENDING_CADENCE: CadenceDefinition = {
  code: 'CONTRACT_PENDING_V1',
  name: 'Contract Pending Follow-up',
  triggerEvent: 'contract.sent',
  entityType: 'deal',
  isActive: true,
  description: 'Follow-up для непідписаних контрактів',
  steps: [
    {
      stepOrder: 1,
      delayMinutes: 120,
      actionType: 'task',
      payload: {
        type: 'contract_followup',
        priority: 'medium',
        title: 'Перевірити статус контракту',
      },
    },
    {
      stepOrder: 2,
      delayMinutes: 1440,
      actionType: 'alert',
      payload: {
        severity: 'medium',
        eventType: 'contract.pending_1day',
        title: 'Контракт не підписано 1 день',
      },
    },
    {
      stepOrder: 3,
      delayMinutes: 4320,
      actionType: 'telegram',
      payload: {
        template: 'CONTRACT_PENDING_ESCALATION',
        message: '⚠️ Контракт не підписано понад 3 дні',
      },
    },
  ],
  stopConditions: ['contract_signed', 'deal_lost'],
};

export const NEW_LEAD_CADENCE: CadenceDefinition = {
  code: 'NEW_LEAD_V1',
  name: 'New Lead Onboarding',
  triggerEvent: 'lead.created',
  entityType: 'lead',
  isActive: true,
  description: 'Автоматичний onboarding нових лідів',
  steps: [
    {
      stepOrder: 1,
      delayMinutes: 0,
      actionType: 'task',
      payload: {
        type: 'first_contact',
        priority: 'high',
        title: 'Перший контакт з клієнтом',
      },
    },
    {
      stepOrder: 2,
      delayMinutes: 15,
      actionType: 'alert',
      payload: {
        severity: 'medium',
        eventType: 'lead.first_contact_due',
        title: 'SLA: 15 хвилин на перший контакт',
      },
    },
    {
      stepOrder: 3,
      delayMinutes: 60,
      actionType: 'telegram',
      payload: {
        template: 'NEW_LEAD_URGENT',
        message: '🔥 Новий лід без контакту понад 1 годину!',
      },
    },
  ],
  stopConditions: ['lead_contacted', 'deal_created', 'lead_lost'],
};

// All cadences for seeding
export const ALL_CADENCES: CadenceDefinition[] = [
  NO_ANSWER_CADENCE,
  PAYMENT_OVERDUE_CADENCE,
  SHIPMENT_STALLED_CADENCE,
  CONTRACT_PENDING_CADENCE,
  NEW_LEAD_CADENCE,
];

// Map event to cadence
export const EVENT_TO_CADENCE: Record<string, string> = {
  'call.no_answer': 'NO_ANSWER_V1',
  'invoice.overdue': 'PAYMENT_OVERDUE_V1',
  'shipment.stalled': 'SHIPMENT_STALLED_V1',
  'contract.sent': 'CONTRACT_PENDING_V1',
  'lead.created': 'NEW_LEAD_V1',
};
