/**
 * Universal Scraper - Auto-detects XHR data from any website
 * 
 * Features:
 * - XHR/Fetch interception
 * - Auto-detection of data arrays
 * - Fallback to SSR (__NEXT_DATA__)
 * - Retry logic
 * - Deduplication
 */

import puppeteer, { Page, Browser, HTTPResponse } from 'puppeteer';

interface InterceptedPayload {
  url: string;
  data: any;
  size: number;
}

interface DetectedData {
  url: string;
  size: number;
  sample: any;
  data: any[];
}

interface ScraperResult {
  items: any[];
  source: string;
  method: 'xhr' | 'ssr' | 'fallback';
  pages: number;
  errors: string[];
}

const BROWSER_PATH = '/pw-browsers/chromium_headless_shell-1208/chrome-linux/headless_shell';

/**
 * Attach universal XHR interceptor to page
 */
export function attachUniversalInterceptor(page: Page): {
  payloads: InterceptedPayload[];
  detach: () => void;
} {
  const payloads: InterceptedPayload[] = [];

  const handler = async (res: HTTPResponse) => {
    const url = res.url();
    const type = res.request().resourceType();

    // Only intercept XHR and Fetch
    if (type !== 'xhr' && type !== 'fetch') return;

    // Skip common non-data endpoints
    if (
      url.includes('analytics') ||
      url.includes('google') ||
      url.includes('facebook') ||
      url.includes('.css') ||
      url.includes('.js') ||
      url.includes('fonts') ||
      url.includes('country') ||
      url.includes('locale') ||
      url.includes('config')
    ) return;

    try {
      const text = await res.text();
      
      // Skip small responses (likely not data)
      if (text.length < 300) return;

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        return; // Not JSON
      }

      payloads.push({
        url,
        data: json,
        size: text.length,
      });

    } catch {
      // Ignore errors
    }
  };

  page.on('response', handler);

  return {
    payloads,
    detach: () => page.off('response', handler),
  };
}

/**
 * Auto-detect the main data array from intercepted payloads
 */
export function detectData(payloads: InterceptedPayload[]): DetectedData | null {
  const candidates: DetectedData[] = [];

  console.log(`[detectData] Processing ${payloads.length} payloads`);

  for (const p of payloads) {
    const data = p.data;
    if (!data) continue;

    // Log all URLs for debugging
    console.log(`[detectData] Payload URL: ${p.url.substring(0, 100)}`);

    // Special handling for Copart search results
    if (p.url.includes('search-results') || p.url.includes('lotSearch')) {
      console.log(`[detectData] Found search-results, data keys: ${Object.keys(data).join(', ')}`);
      console.log(`[detectData] Full data structure: ${JSON.stringify(data).substring(0, 1000)}`);
      if (data.data?.results?.content) {
        console.log(`[detectData] Found Copart content: ${data.data.results.content.length} items`);
        return {
          url: p.url,
          size: data.data.results.content.length,
          sample: data.data.results.content[0],
          data: data.data.results.content,
        };
      }
      if (data.results?.content) {
        console.log(`[detectData] Found results.content: ${data.results.content.length} items`);
        return {
          url: p.url,
          size: data.results.content.length,
          sample: data.results.content[0],
          data: data.results.content,
        };
      }
      // Try to find any array in data
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key]) && data[key].length > 0) {
          console.log(`[detectData] Found array at key ${key}: ${data[key].length} items`);
        }
      }
    }

    // Check common data array locations
    const possibleArrays = [
      { key: 'data', arr: data.data },
      { key: 'data.results', arr: data.data?.results },
      { key: 'data.lotSearchResults', arr: data.data?.lotSearchResults },
      { key: 'data.lots', arr: data.data?.lots },
      { key: 'rows', arr: data.rows },
      { key: 'list', arr: data.list },
      { key: 'results', arr: data.results },
      { key: 'items', arr: data.items },
      { key: 'content', arr: data.content },
      { key: 'records', arr: data.records },
      { key: 'lots', arr: data.lots },
      { key: 'members', arr: data.members },
      { key: 'searchResults.content', arr: data.searchResults?.content },
      { key: 'root', arr: Array.isArray(data) ? data : null },
    ];

    for (const { arr } of possibleArrays) {
      if (Array.isArray(arr) && arr.length > 3) {
        candidates.push({
          url: p.url,
          size: arr.length,
          sample: arr[0],
          data: arr,
        });
      }
    }
  }

  // Return largest array
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0] || null;
}

/**
 * Fallback: Extract data from __NEXT_DATA__ (SSR)
 */
export async function fallbackSSR(page: Page): Promise<any | null> {
  try {
    const data = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (el) {
        return JSON.parse(el.textContent || '{}');
      }
      return (window as any).__NEXT_DATA__ || null;
    });
    return data;
  } catch {
    return null;
  }
}

/**
 * Deduplicate items by ID or name
 */
export function dedupe(items: any[]): any[] {
  const map = new Map<string, any>();

  for (const item of items) {
    const key = 
      item.id?.toString() ||
      item.key ||
      item.slug ||
      item.name ||
      JSON.stringify(item).slice(0, 100);

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

/**
 * Retry wrapper
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delay = 1000
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Retry exhausted');
}

/**
 * Universal scraper - works with any website
 */
/**
 * Get proxy URL from MongoDB
 */
async function getProxyFromDb(): Promise<string | null> {
  try {
    const { MongoClient } = await import('mongodb');
    const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
    const dbName = process.env.DB_NAME || 'test_database';
    
    const client = new MongoClient(mongoUrl);
    await client.connect();
    const db = client.db(dbName);
    
    const proxy = await db.collection('system_proxies')
      .findOne({ enabled: true }, { sort: { priority: 1 } });
    
    await client.close();
    
    if (proxy) {
      let proxyUrl = proxy.server;
      if (proxy.username && proxy.password) {
        const [proto, rest] = proxyUrl.split('://');
        proxyUrl = `${proto}://${proxy.username}:${proxy.password}@${rest}`;
      }
      console.log(`[Scraper] Using proxy: ${proxy.server}`);
      return proxyUrl;
    }
    return null;
  } catch (error) {
    console.log(`[Scraper] Failed to get proxy: ${error}`);
    return null;
  }
}

export async function universalScrape(
  baseUrl: string,
  options: {
    maxPages?: number;
    pageParam?: string;
    scrollCount?: number;
    waitTime?: number;
    proxyUrl?: string;
  } = {}
): Promise<ScraperResult> {
  const {
    maxPages = 5,
    pageParam = 'page',
    scrollCount = 3,
    waitTime = 2000,
  } = options;

  // Get proxy from DB if not provided
  const proxyUrl = options.proxyUrl || await getProxyFromDb();
  
  const browserArgs = [
    '--no-sandbox', 
    '--disable-setuid-sandbox', 
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
  ];
  
  if (proxyUrl) {
    browserArgs.push(`--proxy-server=${proxyUrl}`);
    console.log(`[Scraper] Launching with proxy: ${proxyUrl.split('@')[1] || proxyUrl}`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: browserArgs,
  });

  const results: any[] = [];
  const errors: string[] = [];
  let method: 'xhr' | 'ssr' | 'fallback' = 'xhr';
  let pagesProcessed = 0;

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await browser.newPage();
      const interceptor = attachUniversalInterceptor(page);

      try {
        // Build URL with page param
        const url = baseUrl.includes('?')
          ? `${baseUrl}&${pageParam}=${pageNum}`
          : `${baseUrl}?${pageParam}=${pageNum}`;

        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        await new Promise(r => setTimeout(r, waitTime));

        // Scroll to trigger lazy loading
        for (let i = 0; i < scrollCount; i++) {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 2);
          });
          await new Promise(r => setTimeout(r, 1000));
        }

        // Try XHR detection first
        const detected = detectData(interceptor.payloads);

        if (detected && detected.size > 0) {
          console.log(`[UniversalScraper] Page ${pageNum}: ${detected.size} items from XHR`);
          results.push(...detected.data);
          pagesProcessed++;
        } else {
          // Fallback to SSR
          console.log(`[UniversalScraper] Page ${pageNum}: Trying SSR fallback...`);
          const ssrData = await fallbackSSR(page);
          
          if (ssrData?.props?.pageProps) {
            const pageProps = ssrData.props.pageProps;
            
            // Try to find data arrays in pageProps
            for (const key of Object.keys(pageProps)) {
              const val = pageProps[key];
              if (Array.isArray(val) && val.length > 0) {
                results.push(...val);
                method = 'ssr';
                break;
              }
              if (val?.data && Array.isArray(val.data)) {
                results.push(...val.data);
                method = 'ssr';
                break;
              }
            }
          }
          
          if (method === 'xhr' && results.length === 0) {
            errors.push(`Page ${pageNum}: No data found`);
          }
          pagesProcessed++;
        }

        // Check if we got new unique items
        const uniqueBefore = new Set(results.map(r => r.id || r.key || r.name)).size;
        if (pageNum > 1 && uniqueBefore === results.length) {
          console.log(`[UniversalScraper] No new items on page ${pageNum}, stopping`);
          break;
        }

      } catch (e: any) {
        errors.push(`Page ${pageNum}: ${e.message}`);
      } finally {
        interceptor.detach();
        await page.close();
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }

  } finally {
    await browser.close();
  }

  return {
    items: dedupe(results),
    source: new URL(baseUrl).hostname,
    method,
    pages: pagesProcessed,
    errors,
  };
}

/**
 * Discover XHR endpoints for a website (development mode)
 */
export async function discoverEndpoints(
  url: string
): Promise<{
  xhr: Array<{ url: string; keys: string[]; size: number }>;
  ssr: any;
}> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: BROWSER_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  const interceptor = attachUniversalInterceptor(page);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Scroll to trigger more requests
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await new Promise(r => setTimeout(r, 1000));
    }

    const ssrData = await fallbackSSR(page);

    return {
      xhr: interceptor.payloads.map(p => ({
        url: p.url,
        keys: Object.keys(p.data || {}),
        size: p.size,
      })),
      ssr: ssrData ? Object.keys(ssrData.props?.pageProps || {}) : null,
    };

  } finally {
    interceptor.detach();
    await page.close();
    await browser.close();
  }
}
