/**
 * UTM Extractor Utility
 * 
 * Ensures consistent UTM tracking across the system
 * campaign_name in Meta Ads MUST match utm_campaign
 */

export interface UTMParams {
  source: string;
  campaign: string;
  medium: string;
  content?: string;
  term?: string;
}

/**
 * Extract UTM parameters from request query
 */
export function extractUTM(query: Record<string, any>): UTMParams {
  return {
    source: query.utm_source || query.source || 'direct',
    campaign: query.utm_campaign || query.campaign || 'none',
    medium: query.utm_medium || query.medium || 'organic',
    content: query.utm_content || undefined,
    term: query.utm_term || undefined,
  };
}

/**
 * Normalize campaign name for matching
 * Removes special characters, lowercases
 */
export function normalizeCampaign(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

/**
 * Check if UTM data is meaningful (not just defaults)
 */
export function hasRealUTM(utm: UTMParams): boolean {
  return utm.source !== 'direct' || utm.campaign !== 'none';
}

/**
 * Build UTM query string
 */
export function buildUTMQuery(utm: UTMParams): string {
  const params = new URLSearchParams();
  if (utm.source) params.append('utm_source', utm.source);
  if (utm.campaign) params.append('utm_campaign', utm.campaign);
  if (utm.medium) params.append('utm_medium', utm.medium);
  if (utm.content) params.append('utm_content', utm.content);
  if (utm.term) params.append('utm_term', utm.term);
  return params.toString();
}
