/**
 * Playwright Stealth Adapter
 * 
 * Використовує playwright-extra зі stealth plugin
 * Повний Chrome (не headless_shell) для обходу Cloudflare
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium } from 'playwright-extra';
import type { Browser, Page, BrowserContext } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';
import { SourceType, DiscoveredSource, ExtractedVehicle } from '../dto/vin.dto';

// Apply stealth
chromium.use(stealth());

const MAX_CONCURRENT = 2;
// Use FULL Chromium, not headless shell (critical for Cloudflare bypass)
const CHROME_PATH = '/usr/bin/chromium';

@Injectable()
export class PlaywrightStealthAdapter implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightStealthAdapter.name);
  type: SourceType = 'stealth';
  
  private browser: Browser | null = null;
  private activePages = 0;
  private browserLock = Promise.resolve();

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async extract(vin: string, source: DiscoveredSource): Promise<ExtractedVehicle | null> {
    while (this.activePages >= MAX_CONCURRENT) {
      await this.delay(200);
    }

    this.activePages++;
    let context: BrowserContext | null = null;

    try {
      const browser = await this.getBrowser();
      
      // New context per request for isolation
      context = await browser.newContext({
        viewport: { 
          width: 1920 + Math.floor(Math.random() * 80), 
          height: 1080 + Math.floor(Math.random() * 80) 
        },
        userAgent: this.randomUserAgent(),
        locale: 'en-US',
        timezoneId: 'America/New_York',
        geolocation: { longitude: -73.935242, latitude: 40.730610 },
        permissions: ['geolocation'],
      });

      const page = await context.newPage();
      
      // Additional stealth
      await this.applyStealthScripts(page);

      this.logger.log(`[Playwright] Navigating to ${source.domain}...`);

      // Navigate
      const response = await page.goto(source.url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      // Handle Cloudflare
      const handled = await this.handleCloudflare(page, source.domain);
      if (!handled) {
        await context.close();
        return null;
      }

      // Human behavior
      await this.simulateHuman(page);

      // Wait for content
      await page.waitForTimeout(2000 + Math.random() * 2000);

      // Extract data
      const data = await this.extractData(page, vin, source);
      
      await context.close();
      context = null;

      return data;

    } catch (error: any) {
      this.logger.warn(`[Playwright] ${source.name}: ${error.message}`);
      if (context) await context.close().catch(() => {});
      return null;
    } finally {
      this.activePages--;
    }
  }

  private async handleCloudflare(page: Page, domain: string): Promise<boolean> {
    const content = await page.content();
    
    const hasChallenge = content.includes('challenge-platform') || 
                         content.includes('Just a moment') ||
                         content.includes('Checking your browser') ||
                         content.includes('cf-browser-verification');

    if (!hasChallenge) {
      return true;
    }

    this.logger.log(`[Playwright] Cloudflare challenge on ${domain}, waiting...`);

    // Wait and let JS execute
    await page.waitForTimeout(5000);
    
    // Check for turnstile/checkbox
    try {
      const turnstile = await page.$('iframe[src*="challenges.cloudflare.com"]');
      if (turnstile) {
        const box = await turnstile.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(3000);
        }
      }
    } catch {}

    // Wait for challenge to resolve (up to 20 sec)
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(2000);
      const newContent = await page.content();
      
      if (!newContent.includes('challenge-platform') && 
          !newContent.includes('Just a moment') &&
          !newContent.includes('Checking your browser')) {
        this.logger.log(`[Playwright] Cloudflare passed on ${domain}`);
        return true;
      }
    }

    this.logger.warn(`[Playwright] Cloudflare not passed on ${domain}`);
    return false;
  }

  private async simulateHuman(page: Page): Promise<void> {
    const viewport = page.viewportSize();
    if (!viewport) return;

    // Random mouse movements
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(Math.random() * viewport.width * 0.8 + viewport.width * 0.1);
      const y = Math.floor(Math.random() * viewport.height * 0.8 + viewport.height * 0.1);
      await page.mouse.move(x, y, { steps: 20 });
      await page.waitForTimeout(100 + Math.random() * 200);
    }

    // Scroll
    await page.evaluate(() => {
      window.scrollBy({ top: 300 + Math.random() * 400, behavior: 'smooth' });
    });
    await page.waitForTimeout(500);
  }

  private async extractData(page: Page, vin: string, source: DiscoveredSource): Promise<ExtractedVehicle | null> {
    const data = await page.evaluate((targetVin) => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || null;
      const bodyText = document.body.innerText || '';

      // VIN
      const vinMatches: string[] = bodyText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/gi) || [];
      const foundVin = vinMatches.find(v => v.toUpperCase() === targetVin.toUpperCase()) || vinMatches[0] || null;

      // Title
      let title: string | null = null;
      for (const sel of ['.vehicle-title', '.lot-title', 'h1.title', '.product-title', 'h1']) {
        title = getText(sel);
        if (title && title.length > 5 && title.length < 150) break;
      }

      // Price
      let price: number | null = null;
      const priceMatch = bodyText.match(/\$\s*(\d{1,3}(?:,\d{3})*)/);
      if (priceMatch) {
        price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
      }

      // Images
      const images: string[] = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || img.getAttribute('data-src') || '';
        if (src && src.includes('http') && !src.includes('logo') && !src.includes('icon') && !src.includes('placeholder')) {
          if (src.includes('vehicle') || src.includes('lot') || src.includes('car') || src.includes('auto') || 
              img.width > 200 || img.naturalWidth > 200) {
            images.push(src);
          }
        }
      });

      // Year/Make
      let year: number | null = null;
      let make: string | null = null;
      if (title) {
        const yearMatch = title.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) year = parseInt(yearMatch[0], 10);
        
        const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi', 'Lexus', 
                       'Nissan', 'Tesla', 'Porsche', 'Volkswagen', 'Hyundai', 'Kia', 'Mazda', 'Subaru'];
        for (const m of makes) {
          if (title.toLowerCase().includes(m.toLowerCase())) { make = m; break; }
        }
      }

      // Lot number
      const lotMatch = bodyText.match(/lot\s*(?:#|number|id)?[:\s]*(\d{5,12})/i);
      const lotNumber = lotMatch ? lotMatch[1] : null;

      // Damage
      const damageMatch = bodyText.match(/(?:primary\s*)?damage[:\s]*([^,\n]{3,30})/i);
      const damage = damageMatch ? damageMatch[1].trim() : null;

      // Location  
      const locMatch = bodyText.match(/location[:\s]*([^,\n]+,\s*[A-Z]{2})/i);
      const location = locMatch ? locMatch[1].trim() : null;

      return { foundVin, title, price, images: images.slice(0, 20), year, make, lotNumber, damage, location };
    }, vin);

    if (!data.foundVin && !data.title && !data.price) {
      return null;
    }

    let confidence = 0.5;
    if (data.foundVin?.toUpperCase() === vin.toUpperCase()) confidence += 0.25;
    if (data.price) confidence += 0.1;
    if (data.images.length > 0) confidence += 0.1;
    if (data.title) confidence += 0.05;

    this.logger.log(`[Playwright] ${source.name}: title=${!!data.title}, price=${data.price}, images=${data.images.length}`);

    return {
      vin: data.foundVin?.toUpperCase() || vin.toUpperCase(),
      title: data.title || undefined,
      year: data.year || undefined,
      make: data.make || undefined,
      lotNumber: data.lotNumber || undefined,
      location: data.location || undefined,
      price: data.price || undefined,
      images: data.images,
      damageType: data.damage || undefined,
      source: source.name,
      sourceUrl: source.url,
      sourceTier: source.tier,
      confidence,
      extractedAt: new Date(),
      responseTime: 0, // Will be set by extraction service
    };
  }

  private async applyStealthScripts(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // Chrome object
      (window as any).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
      
      // Plugins
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      
      // Languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      // Platform
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      
      // Hardware
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    });
  }

  private randomUserAgent(): string {
    const versions = ['120', '121', '122', '123', '124'];
    const v = versions[Math.floor(Math.random() * versions.length)];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.browserLock;
      this.browserLock = (async () => {
        if (!this.browser) {
          this.logger.log('[Playwright] Launching full Chrome browser...');
          this.browser = await chromium.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process',
              '--disable-dev-shm-usage',
            ],
          });
        }
      })();
      await this.browserLock;
    }
    return this.browser!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
