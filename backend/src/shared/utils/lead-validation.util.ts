/**
 * Lead Validation Utility
 * 
 * Prevents garbage data from entering CRM
 * Clean data = Clean analytics
 */

export interface LeadData {
  phone?: string;
  email?: string;
  vin?: string;
  name?: string;
  source?: string;
  campaign?: string;
}

/**
 * Validate lead has at least one contact method or VIN
 */
export function isValidLead(lead: LeadData): boolean {
  const hasPhone = !!(lead.phone && lead.phone.length >= 10);
  const hasEmail = !!(lead.email && isValidEmail(lead.email));
  const hasVin = !!(lead.vin && lead.vin.length === 17);
  
  return hasPhone || hasEmail || hasVin;
}

/**
 * Basic email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Phone normalization (remove non-digits, keep +)
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/**
 * VIN validation (17 alphanumeric, no I, O, Q)
 */
export function isValidVIN(vin: string): boolean {
  if (!vin || vin.length !== 17) return false;
  const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
  return vinRegex.test(vin);
}

/**
 * Get lead quality score (0-100)
 */
export function getLeadQuality(lead: LeadData): number {
  let score = 0;
  
  if (lead.phone && lead.phone.length >= 10) score += 30;
  if (lead.email && isValidEmail(lead.email)) score += 25;
  if (lead.vin && isValidVIN(lead.vin)) score += 20;
  if (lead.name && lead.name.length > 2) score += 10;
  if (lead.source && lead.source !== 'direct') score += 10;
  if (lead.campaign && lead.campaign !== 'none') score += 5;
  
  return Math.min(score, 100);
}

/**
 * Reasons why lead might be invalid
 */
export function getLeadValidationErrors(lead: LeadData): string[] {
  const errors: string[] = [];
  
  if (!lead.phone && !lead.email && !lead.vin) {
    errors.push('No contact method (phone, email, or VIN)');
  }
  
  if (lead.phone && lead.phone.length < 10) {
    errors.push('Phone number too short');
  }
  
  if (lead.email && !isValidEmail(lead.email)) {
    errors.push('Invalid email format');
  }
  
  if (lead.vin && !isValidVIN(lead.vin)) {
    errors.push('Invalid VIN format');
  }
  
  return errors;
}
