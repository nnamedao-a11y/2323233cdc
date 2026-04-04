/**
 * HTML Heavy Adapter
 * 
 * Extracts vehicle data using Puppeteer
 * For JS-heavy pages like Copart, IAAI
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { SourceType, DiscoveredSource, ExtractedVehicle } from '../dto/vin.dto';

const BROWSER_PATH = '/pw-browsers/chromium_headless_shell-1208/chrome-linux/headless_shell';
const MAX_CONCURRENT = 3;

@Injectable()
export class HtmlHeavyAdapter implements OnModuleDestroy {
  private readonly logger = new Logger(HtmlHeavyAdapter.name);
  type: SourceType = 'html_heavy';
  
  private browser: puppeteer.Browser | null = null;
  private activePages = 0;
  private browserLock = Promise.resolve();

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async extract(vin: string, source: DiscoveredSource): Promise<ExtractedVehicle | null> {
    // Wait for available slot
    while (this.activePages >= MAX_CONCURRENT) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.activePages++;

    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      try {
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        const response = await page.goto(source.url, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });

        // Check HTTP status
        const status = response?.status() || 0;
        if (status >= 400) {
          this.logger.debug(`[HTMLHeavy] HTTP ${status} from ${source.name}`);
          await page.close();
          return null;
        }

        // Wait for dynamic content
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check page title
        const pageTitle = await page.title();
        const errorTitles = ['404', 'not found', 'error', 'access denied', '403', '500'];
        if (errorTitles.some(err => pageTitle.toLowerCase().includes(err))) {
          await page.close();
          return null;
        }

        // Extract data
        const data = await page.evaluate((targetVin) => {
          const getText = (selector: string): string | null => {
            const el = document.querySelector(selector);
            return el?.textContent?.trim() || null;
          };

          const bodyText = document.body.innerText;

          // Find VIN
          const vinMatch = bodyText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
          const foundVin = vinMatch ? vinMatch[1].toUpperCase() : null;

          // Extract title
          let title = getText('.vehicle-title') || getText('.lot-title') || getText('.car-title');
          if (!title) {
            const h1 = getText('h1');
            if (h1 && h1.length < 100 && /\b(19|20)\d{2}\b/.test(h1)) {
              title = h1;
            }
          }

          // Extract price
          const priceText = getText('.price') || getText('.current-bid') || getText('[data-price]');
          const priceMatch = priceText?.replace(/[,$]/g, '').match(/\d+/);
          const price = priceMatch ? parseInt(priceMatch[0], 10) : null;

          // Extract images
          const images: string[] = [];
          document.querySelectorAll('img').forEach(img => {
            const src = img.src || img.getAttribute('data-src');
            if (src && (src.includes('vehicle') || src.includes('lot') || src.includes('photo'))) {
              if (!src.includes('placeholder') && !src.includes('icon')) {
                images.push(src);
              }
            }
          });

          // Lot number
          const lotMatch = bodyText.match(/lot\s*#?\s*(\d+)/i);
          const lotNumber = lotMatch ? lotMatch[1] : null;

          // Year/Make from title
          let year: number | null = null;
          let make: string | null = null;

          if (title) {
            const yearMatch = title.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) year = parseInt(yearMatch[0], 10);

            const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi', 'Lexus', 'Nissan', 'Tesla', 'Porsche'];
            for (const m of makes) {
              if (title.toLowerCase().includes(m.toLowerCase())) {
                make = m;
                break;
              }
            }
          }

          // Mileage
          const mileageMatch = bodyText.match(/(\d{1,3},?\d{3})\s*(miles?|mi)/i);
          const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, ''), 10) : null;

          // Damage
          let damage: string | null = null;
          const damageKeywords = ['front end', 'rear end', 'side', 'flood', 'fire', 'mechanical'];
          for (const kw of damageKeywords) {
            if (bodyText.toLowerCase().includes(kw)) {
              damage = kw;
              break;
            }
          }

          // Location
          const locationMatch = bodyText.match(/location[:\s]+([^,\n]+,\s*[A-Z]{2})/i);
          const location = locationMatch ? locationMatch[1] : null;

          // Sale date
          const dateMatch = bodyText.match(/sale\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
          const saleDate = dateMatch ? dateMatch[1] : null;

          return {
            foundVin,
            title,
            price,
            images: images.slice(0, 10),
            lotNumber,
            year,
            make,
            mileage,
            damage,
            location,
            saleDate,
          };
        }, vin);

        await page.close();

        // Calculate confidence
        let confidence = 0.3;
        if (data.foundVin === vin.toUpperCase()) confidence += 0.4;
        if (data.price) confidence += 0.1;
        if (data.images.length > 0) confidence += 0.1;
        if (data.title) confidence += 0.1;

        return {
          vin: data.foundVin || vin.toUpperCase(),
          title: data.title || undefined,
          year: data.year || undefined,
          make: data.make || undefined,
          model: undefined,
          lotNumber: data.lotNumber || undefined,
          location: data.location || undefined,
          saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
          price: data.price || undefined,
          images: data.images,
          damageType: data.damage || undefined,
          mileage: data.mileage || undefined,
          source: source.name,
          sourceUrl: source.url,
          sourceTier: source.tier,
          confidence,
          extractedAt: new Date(),
          responseTime: 0,
        };

      } catch (error: any) {
        await page.close().catch(() => {});
        throw error;
      }

    } catch (error: any) {
      this.logger.warn(`[HTMLHeavy] Error from ${source.name}: ${error.message}`);
      return null;
    } finally {
      this.activePages--;
    }
  }

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      await this.browserLock;
      this.browserLock = (async () => {
        if (!this.browser) {
          this.browser = await puppeteer.launch({
            headless: true,
            executablePath: BROWSER_PATH,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-gpu',
              '--disable-dev-shm-usage',
              '--disable-blink-features=AutomationControlled',
            ],
          });
        }
      })();
      await this.browserLock;
    }
    return this.browser!;
  }
}
