/**
 * BIBI Cars - Deal Stage Enum
 * Zoho Blueprint-style stage machine
 */

export enum DealStage {
  NEW_LEAD = 'NEW_LEAD',
  CONTACT_ATTEMPT = 'CONTACT_ATTEMPT',
  QUALIFIED = 'QUALIFIED',
  CAR_SELECTED = 'CAR_SELECTED',
  NEGOTIATION = 'NEGOTIATION',
  CONTRACT_SENT = 'CONTRACT_SENT',
  CONTRACT_SIGNED = 'CONTRACT_SIGNED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_DONE = 'PAYMENT_DONE',
  SHIPPING = 'SHIPPING',
  DELIVERED = 'DELIVERED',
  CLOSED_LOST = 'CLOSED_LOST',
}

export const DEAL_STAGE_ORDER = [
  DealStage.NEW_LEAD,
  DealStage.CONTACT_ATTEMPT,
  DealStage.QUALIFIED,
  DealStage.CAR_SELECTED,
  DealStage.NEGOTIATION,
  DealStage.CONTRACT_SENT,
  DealStage.CONTRACT_SIGNED,
  DealStage.PAYMENT_PENDING,
  DealStage.PAYMENT_DONE,
  DealStage.SHIPPING,
  DealStage.DELIVERED,
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  [DealStage.NEW_LEAD]: 'Новий лід',
  [DealStage.CONTACT_ATTEMPT]: 'Спроба контакту',
  [DealStage.QUALIFIED]: 'Кваліфікований',
  [DealStage.CAR_SELECTED]: 'Авто вибрано',
  [DealStage.NEGOTIATION]: 'Переговори',
  [DealStage.CONTRACT_SENT]: 'Договір надіслано',
  [DealStage.CONTRACT_SIGNED]: 'Договір підписано',
  [DealStage.PAYMENT_PENDING]: 'Очікує оплати',
  [DealStage.PAYMENT_DONE]: 'Оплачено',
  [DealStage.SHIPPING]: 'Доставка',
  [DealStage.DELIVERED]: 'Доставлено',
  [DealStage.CLOSED_LOST]: 'Втрачено',
};
