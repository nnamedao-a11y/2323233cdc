/**
 * Puppeteer HTML Adapter
 * 
 * Використовує Puppeteer для extraction даних зі складних JavaScript-rendered сторінок
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DiscoveredUrl } from '../interfaces/discovered-url.interface';
import { ExtractedVehicle } from '../interfaces/extracted-vehicle.interface';
import puppeteer, { Browser, Page } from 'puppeteer';

@Injectable()
export class PuppeteerHtmlAdapter implements OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerHtmlAdapter.name);
  private browser: Browser | null = null;
  private pagesUsed = 0;
  private readonly maxPagesPerBrowser = 15;

  async onModuleDestroy() {
    await this.closeBrowser();
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || this.pagesUsed >= this.maxPagesPerBrowser) {
      await this.closeBrowser();
      this.browser = await this.launchBrowser();
      this.pagesUsed = 0;
    }
    return this.browser;
  }

  private async launchBrowser(): Promise<Browser> {
    const fs = require('fs');
    const possiblePaths = [
      '/pw-browsers/chromium_headless_shell-1208/chrome-linux/headless_shell',
      '/pw-browsers/chromium-1208/chrome-linux/chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ];

    let executablePath = '/usr/bin/chromium';
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        executablePath = path;
        break;
      }
    }

    return puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
      ],
    });
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
    }
  }

  /**
   * Extract vehicle data using Puppeteer
   */
  async extract(vin: string, item: DiscoveredUrl): Promise<ExtractedVehicle | null> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      this.pagesUsed++;

      await page.setViewport({ width: 1440, height: 900 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );

      // Block images/css for speed
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.logger.debug(`[Puppeteer] Navigating to ${item.url}`);

      const response = await page.goto(item.url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Check HTTP status
      const status = response?.status() || 0;
      if (status >= 400) {
        this.logger.debug(`[Puppeteer] ${item.sourceName}: HTTP ${status}`);
        return null;
      }

      // Wait for dynamic content
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check for error pages
      const pageTitle = await page.title();
      const errorIndicators = ['404', 'not found', 'error', 'access denied'];
      if (errorIndicators.some(err => pageTitle.toLowerCase().includes(err))) {
        return null;
      }

      // Extract data
      const data = await page.evaluate((targetVin: string) => {
        const getText = (sel: string): string | null => {
          const el = document.querySelector(sel);
          return el?.textContent?.trim() || null;
        };

        // Check if VIN is on page
        const bodyText = document.body.innerText.toUpperCase();
        if (!bodyText.includes(targetVin.toUpperCase())) {
          return null;
        }

        // Extract title
        let title = getText('.vehicle-title') || getText('.lot-title') || getText('h1');
        if (title && title.length > 100) title = null;

        // Extract year
        const yearMatch = bodyText.match(/\b(19[89]\d|20[0-2]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

        // Extract price
        const priceText = getText('.price') || getText('.bid-price');
        let price: number | null = null;
        if (priceText) {
          const match = priceText.match(/[\d,]+/);
          if (match) price = parseFloat(match[0].replace(/,/g, ''));
        }

        // Extract lot number
        const lotText = bodyText.match(/lot\s*#?\s*:?\s*(\d{6,12})/i);
        const lotNumber = lotText ? lotText[1] : null;

        // Extract images
        const images: string[] = [];
        document.querySelectorAll('img').forEach(img => {
          const src = img.src;
          if (src?.startsWith('http') && !src.includes('logo') && !src.includes('placeholder')) {
            images.push(src);
          }
        });

        // Extract make
        const makes = ['Toyota', 'Honda', 'Ford', 'BMW', 'Mercedes', 'Audi', 'Lexus', 'Nissan'];
        let make: string | null = null;
        for (const m of makes) {
          if (bodyText.includes(m.toUpperCase())) {
            make = m;
            break;
          }
        }

        return { title, year, make, price, lotNumber, images: images.slice(0, 10) };
      }, vin);

      if (!data) {
        return null;
      }

      const duration = Date.now() - startTime;
      this.logger.log(`[Puppeteer] ${item.sourceName}: ${duration}ms`);

      // Calculate confidence
      let confidence = 0.3;
      if (data.title) confidence += 0.15;
      if (data.price) confidence += 0.15;
      if (data.images.length > 0) confidence += 0.15;
      if (data.lotNumber) confidence += 0.1;
      if (data.year) confidence += 0.05;

      return {
        vin,
        title: data.title || undefined,
        year: data.year || undefined,
        make: data.make || undefined,
        price: data.price || undefined,
        lotNumber: data.lotNumber || undefined,
        images: data.images,
        source: item.sourceName,
        sourceUrl: item.url,
        confidence,
      };

    } catch (error: any) {
      this.logger.warn(`[Puppeteer] ${item.sourceName}: ${error.message}`);
      return null;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {}
      }
    }
  }

  /**
   * Extract from multiple URLs
   */
  async extractMultiple(vin: string, items: DiscoveredUrl[]): Promise<ExtractedVehicle[]> {
    const results: ExtractedVehicle[] = [];

    for (const item of items) {
      if (item.parserKind !== 'html_detail' && item.parserKind !== 'search_form') {
        continue;
      }

      const result = await this.extract(vin, item);
      if (result) {
        results.push(result);
      }

      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      const browser = await this.getBrowser();
      return {
        healthy: true,
        message: `Browser active, ${this.pagesUsed}/${this.maxPagesPerBrowser} pages used`,
      };
    } catch (error: any) {
      return { healthy: false, message: error.message };
    }
  }
}
