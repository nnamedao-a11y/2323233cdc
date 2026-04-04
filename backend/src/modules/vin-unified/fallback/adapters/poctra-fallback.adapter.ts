/**
 * Poctra Fallback Adapter
 * 
 * Scrapes Poctra.com for VIN data.
 * Trust score: 0.4 (aggregator)
 * 
 * Uses Puppeteer with Stealth plugin for Cloudflare bypass.
 */

import { BaseFallbackAdapter } from '../base-fallback.adapter';
import { Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

const BROWSER_PATH = '/usr/bin/chromium';
const TIMEOUT_MS = 25000;

export class PoctraFallbackAdapter extends BaseFallbackAdapter {
  readonly source = 'Poctra';
  readonly enabled = true;
  private readonly logger = new Logger(PoctraFallbackAdapter.name);

  protected async scrape(vin: string): Promise<any> {
    this.logger.log(`[Poctra] Starting scrape for VIN=${vin}`);
    
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

      // Poctra URL pattern - search by VIN
      const url = `https://poctra.com/search/${vin}`;
      this.logger.debug(`[Poctra] Navigating to ${url}`);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT_MS,
      });

      const status = response?.status() || 0;
      this.logger.debug(`[Poctra] HTTP ${status}`);

      if (status === 404 || status >= 400) {
        this.logger.debug(`[Poctra] VIN not found (HTTP ${status})`);
        return this.emptyResult();
      }

      // Wait for content to load
      await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
      await this.delay(2000);

      // Extract data from page
      const data = await page.evaluate((targetVin: string) => {
        const bodyText = document.body.innerText || '';
        
        // Find VIN on page
        const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
        const vinMatches: string[] = bodyText.match(vinRegex) || [];
        const foundVin = vinMatches.find((v: string) => v.toUpperCase() === targetVin.toUpperCase()) || null;

        // Extract lot number
        let lotNumber: string | null = null;
        const lotPatterns = [
          /Lot\s*[#:]?\s*(\d{6,9})/i,
          /Stock\s*[#:]?\s*(\d{6,9})/i,
          /(\d{7,9})/,
        ];
        for (const pattern of lotPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            lotNumber = match[1];
            break;
          }
        }

        // Extract auction name
        let auctionName: string | null = null;
        if (bodyText.toUpperCase().includes('COPART')) auctionName = 'Copart';
        else if (bodyText.toUpperCase().includes('IAAI')) auctionName = 'IAAI';

        // Extract price
        let price: number | null = null;
        const pricePatterns = [
          /\$([\d,]+)/,
          /(?:bid|price)[:\s]*\$([\d,]+)/i,
        ];
        for (const pattern of pricePatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            const parsed = parseInt(match[1].replace(/,/g, ''), 10);
            if (parsed > 100 && parsed < 1000000) {
              price = parsed;
              break;
            }
          }
        }

        // Extract year
        let year: number | null = null;
        const yearMatch = bodyText.match(/\b(19[89]\d|20[0-2]\d)\b/);
        if (yearMatch) year = parseInt(yearMatch[1], 10);

        // Extract make
        let make: string | null = null;
        const makes = ['TESLA', 'TOYOTA', 'HONDA', 'FORD', 'CHEVROLET', 'BMW', 'MERCEDES', 'AUDI', 
                       'LEXUS', 'NISSAN', 'PORSCHE', 'VOLKSWAGEN', 'HYUNDAI', 'KIA', 'MAZDA', 'SUBARU'];
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

        // Extract odometer
        let odometer: number | null = null;
        const odometerPatterns = [
          /(\d{1,3},?\d{3})\s*(?:miles?|mi)/i,
          /odometer[:\s]*(\d{1,3},?\d{3})/i,
        ];
        for (const pattern of odometerPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            odometer = parseInt(match[1].replace(/,/g, ''), 10);
            break;
          }
        }

        // Extract damage type
        let damageType: string | null = null;
        const damageMatch = bodyText.match(/(Front End|Rear End|Side|Roll Over|Flood|Fire|Mechanical|All Over|Minor Dent)/i);
        if (damageMatch) damageType = damageMatch[1];

        // Extract images
        const images: string[] = [];
        document.querySelectorAll('img').forEach(img => {
          const src = img.src || img.getAttribute('data-src') || '';
          if (src.length > 50 && (src.includes('lot') || src.includes('vehicle') || src.includes('image'))) {
            if (!src.includes('logo') && !src.includes('icon') && !src.includes('placeholder')) {
              images.push(src);
            }
          }
        });

        return {
          foundVin,
          lotNumber,
          auctionName,
          price,
          odometer,
          year,
          make,
          model,
          damageType,
          images: images.slice(0, 10),
        };
      }, vin);

      this.logger.log(
        `[Poctra] Extracted: vin=${data.foundVin}, lot=${data.lotNumber}, price=${data.price}`
      );

      return {
        vin: data.foundVin,
        lotNumber: data.lotNumber,
        auctionName: data.auctionName,
        price: data.price,
        odometer: data.odometer,
        year: data.year,
        make: data.make,
        model: data.model,
        damageType: data.damageType,
        images: data.images,
        sourceUrl: url,
      };

    } catch (error: any) {
      this.logger.warn(`[Poctra] Scrape error: ${error.message}`);
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
