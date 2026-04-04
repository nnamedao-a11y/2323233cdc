/**
 * ROI Calculation Utility
 * 
 * Safe ROI calculation with fallbacks
 * Never show fake ROI when data is missing
 */

export interface ROIData {
  spend: number;
  profit: number;
  revenue?: number;
  leads?: number;
  deals?: number;
}

export interface ROIResult {
  roi: number | null;
  roiFormatted: string;
  isValid: boolean;
  reason?: string;
}

/**
 * Calculate ROI safely
 * Returns null if data is insufficient
 */
export function calculateROI(data: ROIData): ROIResult {
  // No spend data - can't calculate ROI
  if (!data.spend || data.spend === 0) {
    return {
      roi: null,
      roiFormatted: 'N/A',
      isValid: false,
      reason: 'No spend data',
    };
  }

  // Negative spend is invalid
  if (data.spend < 0) {
    return {
      roi: null,
      roiFormatted: 'Invalid',
      isValid: false,
      reason: 'Invalid spend value',
    };
  }

  // Calculate ROI
  const roi = ((data.profit - data.spend) / data.spend) * 100;
  const rounded = Math.round(roi * 10) / 10;

  return {
    roi: rounded,
    roiFormatted: `${rounded >= 0 ? '+' : ''}${rounded}%`,
    isValid: true,
  };
}

/**
 * Get ROI status for display
 */
export function getROIStatus(roi: number | null): {
  status: 'excellent' | 'good' | 'watch' | 'bad' | 'unknown';
  color: string;
  emoji: string;
} {
  if (roi === null) {
    return { status: 'unknown', color: 'gray', emoji: '❓' };
  }

  if (roi > 50) {
    return { status: 'excellent', color: 'green', emoji: '🔥' };
  }
  if (roi > 20) {
    return { status: 'good', color: 'blue', emoji: '✅' };
  }
  if (roi > 0) {
    return { status: 'watch', color: 'yellow', emoji: '⚠️' };
  }
  return { status: 'bad', color: 'red', emoji: '❌' };
}

/**
 * Calculate CPL (Cost Per Lead)
 */
export function calculateCPL(spend: number, leads: number): number | null {
  if (!spend || !leads || leads === 0) return null;
  return Math.round((spend / leads) * 100) / 100;
}

/**
 * Calculate CPA (Cost Per Acquisition/Deal)
 */
export function calculateCPA(spend: number, deals: number): number | null {
  if (!spend || !deals || deals === 0) return null;
  return Math.round((spend / deals) * 100) / 100;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
