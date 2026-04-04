/**
 * Page Extractor Service
 * 
 * Extracts vehicle data from web pages
 * Uses Puppeteer for dynamic content
 */

import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { FilteredUrl } from './url-filter.service';

const BROWSER_PATH = '/pw-browsers/chromium_headless_shell-1208/chrome-linux/headless_shell';

export interface ExtractedData {
  vin: string | null;
  title: string | null;
  price: number | null;
  images: string[];
  saleDate: string | null;
  lotNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  damageType: string | null;
  location: string | null;
  source: string;
  sourceUrl: string;
  confidence: number;
}

@Injectable()
export class ExtractorService {
  private readonly logger = new Logger(ExtractorService.name);

  /**
   * Extract data from multiple URLs
   */
  async extractFromUrls(urls: FilteredUrl[], targetVin: string): Promise<ExtractedData[]> {
    const results: ExtractedData[] = [];
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: BROWSER_PATH,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      });

      // Process URLs in parallel (max 3 at a time)
      const chunks = this.chunkArray(urls, 3);
      
      for (const chunk of chunks) {
        const promises = chunk.map(url => 
          this.extractFromUrl(browser, url, targetVin)
            .catch(err => {
              this.logger.warn(`Extract failed for ${url.url}: ${err.message}`);
              return null;
            })
        );

        const chunkResults = await Promise.all(promises);
        results.push(...chunkResults.filter(Boolean) as ExtractedData[]);
      }

    } catch (error: any) {
      this.logger.error(`Extraction error: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }

    return results;
  }

  /**
   * Extract data from single URL
   */
  private async extractFromUrl(
    browser: puppeteer.Browser, 
    urlInfo: FilteredUrl,
    targetVin: string
  ): Promise<ExtractedData | null> {
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const response = await page.goto(urlInfo.url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 20000 
      });

      // Check HTTP status - skip 404/403/500 pages
      const status = response?.status() || 0;
      if (status >= 400) {
        this.logger.debug(`[Extractor] Skipping ${urlInfo.url} - HTTP ${status}`);
        await page.close();
        return null;
      }

      // Wait a bit for dynamic content
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check page title for 404 indicators
      const pageTitle = await page.title();
      const errorTitles = ['404', 'not found', 'error', 'page not found', 'access denied', '403', '500'];
      if (errorTitles.some(err => pageTitle.toLowerCase().includes(err))) {
        this.logger.debug(`[Extractor] Skipping ${urlInfo.url} - Error page detected: ${pageTitle}`);
        await page.close();
        return null;
      }

      const data = await page.evaluate((vin) => {
        // Helper to extract text
        const getText = (selector: string): string | null => {
          const el = document.querySelector(selector);
          return el?.textContent?.trim() || null;
        };

        // Helper to extract number
        const getNumber = (text: string | null): number | null => {
          if (!text) return null;
          const match = text.replace(/[,$]/g, '').match(/\d+/);
          return match ? parseInt(match[0], 10) : null;
        };

        // Try to find VIN on page
        let foundVin: string | null = null;
        const vinPatterns = [
          /\b([A-HJ-NPR-Z0-9]{17})\b/gi,
        ];
        
        const bodyText = document.body.innerText;
        for (const pattern of vinPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            foundVin = match[0].toUpperCase();
            break;
          }
        }

        // Extract title - more specific selectors first
        let title = getText('.vehicle-title') || 
                    getText('.lot-title') || 
                    getText('.car-title') ||
                    getText('[data-testid="vehicle-title"]') ||
                    getText('.vehicle-make-model') ||
                    getText('.listing-title');
        
        // Fallback to h1 only if it looks like a vehicle title
        if (!title) {
          const h1Text = getText('h1');
          if (h1Text && h1Text.length < 100) {
            // Check if h1 contains year pattern (like "2020 BMW X5")
            const hasYear = /\b(19|20)\d{2}\b/.test(h1Text);
            if (hasYear || h1Text.toLowerCase().match(/\b(toyota|honda|ford|bmw|mercedes|audi|lexus|nissan|hyundai|kia|volkswagen|subaru|mazda|porsche|tesla|jeep|ram|gmc|dodge|chrysler|chevrolet|buick|cadillac|acura|infiniti|volvo|land rover|jaguar|mini|mitsubishi|suzuki|fiat|alfa|ferrari|lamborghini|bentley|rolls|maserati)\b/i)) {
              title = h1Text;
            }
          }
        }
        
        // Skip spam/landing page titles
        const spamTitles = ['auto auctions', 'buy car', 'sell car', 'welcome', 'homepage', 'search results', 'login', 'sign up', 'register'];
        if (title && spamTitles.some(spam => (title as string).toLowerCase().includes(spam))) {
          title = null;
        }

        // Extract price
        let priceText = getText('.price') || getText('.current-bid') || getText('[data-price]');
        let price = getNumber(priceText);

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

        // Extract lot number
        let lotNumber: string | null = null;
        const lotMatch = bodyText.match(/lot\s*#?\s*(\d+)/i);
        if (lotMatch) lotNumber = lotMatch[1];

        // Extract year/make/model from title
        let year: number | null = null;
        let make: string | null = null;
        let model: string | null = null;

        if (title) {
          const yearMatch = title.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) year = parseInt(yearMatch[0], 10);

          // Common makes
          const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi', 'Lexus', 'Nissan', 'Hyundai', 'Kia', 'Volkswagen', 'Subaru', 'Mazda', 'Porsche', 'Tesla', 'Jeep', 'Ram', 'GMC', 'Dodge', 'Chrysler'];
          for (const m of makes) {
            if (title.toLowerCase().includes(m.toLowerCase())) {
              make = m;
              break;
            }
          }
        }

        // Extract mileage
        let mileage: number | null = null;
        const mileageMatch = bodyText.match(/(\d{1,3},?\d{3})\s*(miles?|mi|km)/i);
        if (mileageMatch) {
          mileage = parseInt(mileageMatch[1].replace(/,/g, ''), 10);
        }

        // Extract damage
        let damageType: string | null = null;
        const damageKeywords = ['front end', 'rear end', 'side', 'flood', 'fire', 'vandalism', 'hail', 'mechanical', 'rollover'];
        for (const kw of damageKeywords) {
          if (bodyText.toLowerCase().includes(kw)) {
            damageType = kw;
            break;
          }
        }

        // Extract location
        let location: string | null = null;
        const locationMatch = bodyText.match(/location[:\s]+([^,\n]+,\s*[A-Z]{2})/i);
        if (locationMatch) location = locationMatch[1];

        // Extract sale date
        let saleDate: string | null = null;
        const dateMatch = bodyText.match(/sale\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
        if (dateMatch) saleDate = dateMatch[1];

        return {
          foundVin,
          title,
          price,
          images: images.slice(0, 10), // Limit images
          lotNumber,
          year,
          make,
          model,
          mileage,
          damageType,
          location,
          saleDate,
        };
      }, targetVin);

      await page.close();

      // Verify VIN matches or is found
      const vinMatch = data.foundVin === targetVin.toUpperCase();
      
      // Calculate confidence
      let confidence = 0;
      if (vinMatch) confidence += 0.4;
      if (data.price) confidence += 0.2;
      if (data.images.length > 0) confidence += 0.2;
      if (data.title) confidence += 0.1;
      if (data.saleDate) confidence += 0.1;

      return {
        vin: data.foundVin,
        title: data.title,
        price: data.price,
        images: data.images,
        saleDate: data.saleDate,
        lotNumber: data.lotNumber,
        make: data.make,
        model: data.model,
        year: data.year,
        mileage: data.mileage,
        damageType: data.damageType,
        location: data.location,
        source: urlInfo.source,
        sourceUrl: urlInfo.url,
        confidence,
      };

    } catch (error: any) {
      await page.close();
      throw error;
    }
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
