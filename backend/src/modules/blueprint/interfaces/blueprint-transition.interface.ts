/**
 * BIBI Cars - Blueprint Transition Interface
 */

import { DealStage } from '../blueprint-stage.enum';

export interface BlueprintTransition {
  from: DealStage;
  to: DealStage;

  // Required fields that must be filled before transition
  requiredFields?: string[];

  // Required actions that must be completed before transition
  requiredActions?: string[];

  // Blockers that prevent transition
  blockers?: string[];

  // Actions to execute when entering the new stage
  onEnterActions?: string[];

  // Optional: description for UI
  description?: string;
}

export interface BlueprintValidationResult {
  ok: boolean;
  missingFields: string[];
  missingActions: string[];
  blockers: string[];
  message?: string;
}

export interface DealContext {
  id: string;
  stage: DealStage;
  managerId?: string;
  teamLeadId?: string;
  customerId?: string;
  vin?: string;
  lotId?: string;
  vehicleTitle?: string;

  // Flags for validation
  hasCustomer?: boolean;
  hasCalls?: boolean;
  callCount?: number;
  contractSigned?: boolean;
  contractId?: string;
  invoiceCreated?: boolean;
  depositPaid?: boolean;
  fullPaymentDone?: boolean;
  shipmentCreated?: boolean;
  shipmentId?: string;
  shipmentDelivered?: boolean;
  trackingAdded?: boolean;
}
