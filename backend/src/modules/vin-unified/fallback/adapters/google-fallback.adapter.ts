/**
 * Google Fallback Adapter
 * 
 * Searches Google for VIN-related auction data.
 * Trust score: 0.2 (lowest — unstructured web results)
 * 
 * Uses Puppeteer with Stealth plugin.
 * Searches for: "VIN copart OR iaai lot"
 */

import { BaseFallbackAdapter } from '../base-fallback.adapter';
import { Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

const BROWSER_PATH = '/usr/bin/chromium';
const TIMEOUT_MS = 20000;

export class GoogleFallbackAdapter extends BaseFallbackAdapter {
  readonly source = 'Google';
  readonly enabled = true;
  private readonly logger = new Logger(GoogleFallbackAdapter.name);

  protected async scrape(vin: string): Promise<any> {
    this.logger.log(`[Google] Starting search for VIN=${vin}`);
    
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: BROWSER_PATH,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080',
        ],
      }) as unknown as Browser;

      page = await browser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      
      await page.setViewport({ width: 1920, height: 1080 });

      // Google search query for VIN
      const searchQuery = encodeURIComponent(`"${vin}" copart OR iaai lot`);
      const url = `https://www.google.com/search?q=${searchQuery}&num=10`;
      
      this.logger.debug(`[Google] Navigating to search`);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT_MS,
      });

      const status = response?.status() || 0;
      
      if (status >= 400) {
        this.logger.debug(`[Google] Search failed (HTTP ${status})`);
        return this.emptyResult();
      }

      // Wait for search results
      await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
      await this.delay(2000);

      // Extract data from search results
      const data = await page.evaluate((targetVin: string) => {
        const bodyText = document.body.innerText || '';
        
        // Find VIN on page (in search results)
        const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
        const vinMatches: string[] = bodyText.match(vinRegex) || [];
        const foundVin = vinMatches.find((v: string) => v.toUpperCase() === targetVin.toUpperCase()) || null;

        if (!foundVin) {
          return { foundVin: null };
        }

        // Extract lot number from snippets
        let lotNumber: string | null = null;
        const lotPatterns = [
          /Lot\s*[#:]?\s*(\d{6,9})/i,
          /(\d{7,9})\s*[-–]\s*(?:Copart|IAAI)/i,
        ];
        for (const pattern of lotPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            lotNumber = match[1];
            break;
          }
        }

        // Determine auction name
        let auctionName: string | null = null;
        const copartCount = (bodyText.match(/copart/gi) || []).length;
        const iaaiCount = (bodyText.match(/iaai/gi) || []).length;
        if (copartCount > iaaiCount) auctionName = 'Copart';
        else if (iaaiCount > 0) auctionName = 'IAAI';

        // Extract price from snippets
        let price: number | null = null;
        const priceMatch = bodyText.match(/\$([\d,]+)/);
        if (priceMatch) {
          const parsed = parseInt(priceMatch[1].replace(/,/g, ''), 10);
          if (parsed > 100 && parsed < 1000000) price = parsed;
        }

        // Extract year from snippets (look near VIN mention)
        let year: number | null = null;
        const yearMatch = bodyText.match(/\b(19[89]\d|20[0-2]\d)\b/);
        if (yearMatch) year = parseInt(yearMatch[1], 10);

        // Extract make
        let make: string | null = null;
        const makes = ['TESLA', 'TOYOTA', 'HONDA', 'FORD', 'CHEVROLET', 'BMW', 'MERCEDES', 'AUDI', 
                       'LEXUS', 'NISSAN', 'PORSCHE', 'VOLKSWAGEN', 'HYUNDAI', 'KIA'];
        for (const m of makes) {
          if (bodyText.toUpperCase().includes(m)) {
            make = m;
            break;
          }
        }

        // Extract model
        let model: string | null = null;
        if (make) {
          const modelMatch = bodyText.match(new RegExp(make + '\\s+([A-Z0-9][A-Z0-9\\s\\-]{1,15})', 'i'));
          if (modelMatch) model = modelMatch[1].trim();
        }

        return {
          foundVin,
          lotNumber,
          auctionName,
          price,
          year,
          make,
          model,
        };
      }, vin);

      this.logger.log(
        `[Google] Extracted: vin=${data.foundVin}, lot=${data.lotNumber}, auction=${data.auctionName}`
      );

      return {
        vin: data.foundVin,
        lotNumber: data.lotNumber || null,
        auctionName: data.auctionName || null,
        price: data.price || null,
        odometer: null, // Google rarely shows mileage in snippets
        year: data.year || null,
        make: data.make || null,
        model: data.model || null,
        damageType: null,
        images: [],
        sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(vin)}`,
      };

    } catch (error: any) {
      this.logger.warn(`[Google] Search error: ${error.message}`);
      return this.emptyResult();
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  private emptyResult() {
    return {
      vin: null,
      lotNumber: null,
      auctionName: null,
      price: null,
      odometer: null,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
