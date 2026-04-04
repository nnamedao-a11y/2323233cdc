/**
 * NetworkInterceptor - Intercepts XHR/Fetch responses from pages
 * 
 * Key layer for extracting real API data instead of __NEXT_DATA__
 */

import { Page, HTTPResponse } from 'puppeteer';

export interface InterceptResult {
  matchedUrls: string[];
  payloads: any[];
  errors: string[];
  detach: () => void;
}

export type ResponseMatcher = (url: string, response: HTTPResponse) => boolean;

/**
 * Attach JSON response interceptor to page
 */
export async function attachJsonInterceptor(
  page: Page,
  matcher: ResponseMatcher,
): Promise<InterceptResult> {
  const payloads: any[] = [];
  const matchedUrls: string[] = [];
  const errors: string[] = [];

  const handler = async (response: HTTPResponse) => {
    const url = response.url();

    try {
      if (!matcher(url, response)) return;

      matchedUrls.push(url);

      const headers = response.headers();
      const contentType = headers['content-type'] || '';

      // Only process JSON responses
      if (!contentType.includes('application/json')) {
        return;
      }

      const json = await response.json();
      payloads.push({
        url,
        data: json,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Silently ignore failed responses (common for non-JSON or already read responses)
    }
  };

  page.on('response', handler);

  return {
    matchedUrls,
    payloads,
    errors,
    detach: () => {
      page.off('response', handler);
    },
  };
}

/**
 * Discovery mode matcher - catches all XHR/Fetch requests
 */
export function discoveryMatcher(url: string, response: HTTPResponse): boolean {
  const resourceType = response.request().resourceType();
  return ['xhr', 'fetch'].includes(resourceType);
}

/**
 * Create URL pattern matcher
 */
export function createUrlMatcher(patterns: string[]): ResponseMatcher {
  return (url: string, response: HTTPResponse) => {
    const resourceType = response.request().resourceType();
    if (!['xhr', 'fetch'].includes(resourceType)) return false;
    
    return patterns.some(pattern => url.includes(pattern));
  };
}

/**
 * Dropstab-specific matcher for API endpoints
 */
export function dropstabApiMatcher(url: string, response: HTTPResponse): boolean {
  const resourceType = response.request().resourceType();
  if (!['xhr', 'fetch'].includes(resourceType)) return false;

  // Known Dropstab API patterns
  const patterns = [
    '/api/',
    '/_next/data/',
    'investors',
    'fundraising',
    'funding',
    'unlocks',
    'vesting',
    'coins',
  ];

  return patterns.some(p => url.toLowerCase().includes(p));
}

/**
 * CryptoRank-specific matcher for API endpoints
 */
export function cryptoRankApiMatcher(url: string, response: HTTPResponse): boolean {
  const resourceType = response.request().resourceType();
  if (!['xhr', 'fetch'].includes(resourceType)) return false;

  // Known CryptoRank API patterns
  const patterns = [
    '/api/',
    '/_next/data/',
    'funding-rounds',
    'funds',
    'investors',
    'token-unlock',
    'categories',
    'launchpads',
  ];

  return patterns.some(p => url.toLowerCase().includes(p));
}

/**
 * Extract __NEXT_DATA__ from page as fallback
 */
export async function extractNextData(page: Page): Promise<any | null> {
  try {
    const nextData = await page.evaluate(() => {
      const script = document.getElementById('__NEXT_DATA__');
      if (script && script.textContent) {
        try {
          return JSON.parse(script.textContent);
        } catch {
          return null;
        }
      }
      return null;
    });
    return nextData;
  } catch {
    return null;
  }
}
