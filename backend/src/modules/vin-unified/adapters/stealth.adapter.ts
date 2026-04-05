/**
 * Stealth Scraper Adapter
 * 
 * Обхід Cloudflare та Anti-Bot захисту через:
 * 1. puppeteer-extra + stealth plugin
 * 2. Рандомізація fingerprint
 * 3. Імітація людської поведінки
 * 4. Рандомні затримки
 * 5. Mouse movement emulation
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { SourceType, DiscoveredSource, ExtractedVehicle } from '../dto/vin.dto';

// Add stealth plugin
puppeteer.use(StealthPlugin());

// Use FULL Chromium, not headless shell (critical for Cloudflare bypass)
const BROWSER_PATH = '/usr/bin/chromium';
const MAX_CONCURRENT = 2; // Lower for stealth

// Realistic user agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
];

// Viewport sizes
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

// Languages
const LANGUAGES = ['en-US', 'en-GB', 'en'];

@Injectable()
export class StealthAdapter implements OnModuleDestroy {
  private readonly logger = new Logger(StealthAdapter.name);
  type: SourceType = 'html_heavy';
  
  private browser: Browser | null = null;
  private activePages = 0;
  private browserLock = Promise.resolve();
  private lastRequestTime = 0;

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Extract with stealth mode
   */
  async extract(vin: string, source: DiscoveredSource): Promise<ExtractedVehicle | null> {
    // Wait for available slot
    while (this.activePages >= MAX_CONCURRENT) {
      await this.delay(100);
    }

    // Rate limiting between requests
    const minDelay = 2000 + Math.random() * 3000; // 2-5 seconds
    const timeSinceLast = Date.now() - this.lastRequestTime;
    if (timeSinceLast < minDelay) {
      await this.delay(minDelay - timeSinceLast);
    }
    this.lastRequestTime = Date.now();

    this.activePages++;

    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Randomize fingerprint
      await this.setupStealthPage(page);

      this.logger.log(`[Stealth] Navigating to ${source.domain} -> ${source.url}`);

      // Navigate with timeout
      const response = await page.goto(source.url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      const status = response?.status() || 0;
      this.logger.log(`[Stealth] Got HTTP ${status} from ${source.domain}`);
      
      // Check for Cloudflare challenge or 403
      // Skip Cloudflare handling for stat.vin - it uses different loading pattern
      let pageContent = await page.content();
      const hasCloudflare = !source.domain.includes('stat.vin') && (
                           pageContent.includes('challenge-platform') || 
                           pageContent.includes('cf-browser-verification') ||
                           pageContent.includes('Just a moment') ||
                           pageContent.includes('Checking your browser'));
      
      if (hasCloudflare || status === 403) {
        this.logger.log(`[Stealth] Cloudflare detected on ${source.domain}, waiting for challenge...`);
        
        // Simulate human behavior while waiting
        await this.simulateHumanBehavior(page);
        
        // Wait longer for challenge to auto-resolve
        await this.delay(8000 + Math.random() * 4000);
        
        // Check if challenge passed
        pageContent = await page.content();
        const stillBlocked = pageContent.includes('challenge-platform') || 
                            pageContent.includes('Just a moment') ||
                            pageContent.includes('403 Forbidden');
        
        if (stillBlocked) {
          // Try clicking if there's a verify button
          try {
            const verifyButton = await page.$('input[type="button"], button[type="submit"], .cf-turnstile');
            if (verifyButton) {
              await verifyButton.click();
              await this.delay(5000);
            }
          } catch {}
          
          // Final check
          pageContent = await page.content();
          if (pageContent.includes('403') || pageContent.includes('challenge-platform')) {
            this.logger.warn(`[Stealth] Failed to bypass Cloudflare on ${source.domain}`);
            await page.close();
            return null;
          }
        }
        
        this.logger.log(`[Stealth] Cloudflare challenge passed on ${source.domain}`);
      }

      if (status >= 400 && status !== 403) {
        this.logger.debug(`[Stealth] HTTP ${status} from ${source.name}`);
        await page.close();
        return null;
      }

      // Wait for page to fully load
      await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
      
      // Simulate human behavior
      await this.simulateHumanBehavior(page);

      // Wait for dynamic content to render
      await this.delay(2000 + Math.random() * 1500);

      // 🔥 CRITICAL FIX: Navigate to LOT PAGE before extraction
      // Search pages only show previews, we need full lot data
      const lotPageUrl = await this.findLotPageUrl(page, vin, source);
      
      if (lotPageUrl) {
        this.logger.log(`[Stealth] Found lot page: ${lotPageUrl}`);
        
        // Navigate to lot page
        const lotResponse = await page.goto(lotPageUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        }).catch(() => null);
        
        if (lotResponse && lotResponse.status() < 400) {
          // Wait for lot page to load
          await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
          await this.delay(2000 + Math.random() * 1500);
          
          // Verify we're on lot page
          const currentUrl = page.url();
          const isLotPage = currentUrl.includes('/lot/') || 
                           currentUrl.includes('/vehicle/') ||
                           currentUrl.includes('/item/') ||
                           currentUrl.includes('/VehicleDetail');
          
          if (isLotPage) {
            this.logger.log(`[Stealth] Successfully navigated to lot page for ${source.name}`);
          }
        }
      } else {
        this.logger.debug(`[Stealth] No lot page link found for ${source.name}, using search results`);
      }

      // Extract FULL data from current page (lot page or search page)
      const data = await this.extractVehicleData(page, vin, source);
      
      await page.close();
      page = null;

      return data;

    } catch (error: any) {
      this.logger.warn(`[Stealth] Error from ${source.name}: ${error.message}`);
      if (page) await page.close().catch(() => {});
      return null;
    } finally {
      this.activePages--;
    }
  }

  /**
   * Setup stealth page with randomized fingerprint
   */
  private async setupStealthPage(page: Page): Promise<void> {
    // Random user agent - use latest Chrome versions
    const chromeVersion = 120 + Math.floor(Math.random() * 5);
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;
    await page.setUserAgent(userAgent);

    // Random viewport with slight variations
    const baseViewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
    await page.setViewport({
      width: baseViewport.width + Math.floor(Math.random() * 50),
      height: baseViewport.height + Math.floor(Math.random() * 50),
    });

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Ch-Ua': `"Not_A Brand";v="8", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`,
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    });

    // Advanced evasion techniques
    await page.evaluateOnNewDocument(() => {
      // Delete webdriver property completely
      delete (navigator as any).webdriver;
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
      
      // Chrome runtime mock
      (window as any).chrome = {
        runtime: {
          connect: () => {},
          sendMessage: () => {},
          onMessage: { addListener: () => {} },
        },
        loadTimes: () => ({
          commitLoadTime: Date.now() / 1000 - Math.random() * 10,
          connectionInfo: 'http/1.1',
          finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 5,
          finishLoadTime: Date.now() / 1000 - Math.random() * 3,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: Date.now() / 1000 - Math.random() * 8,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'http/1.1',
          requestTime: Date.now() / 1000 - Math.random() * 12,
          startLoadTime: Date.now() / 1000 - Math.random() * 11,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false,
        }),
        csi: () => ({ pageT: Date.now(), startE: Date.now() - Math.random() * 5000 }),
        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed' } },
      };

      // Languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true,
      });

      // Proper plugins mock (like real Chrome)
      const pluginData = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ];
      const plugins = pluginData.map(p => {
        const plugin = Object.create(Plugin.prototype);
        Object.defineProperties(plugin, {
          name: { get: () => p.name },
          filename: { get: () => p.filename },
          description: { get: () => 'Portable Document Format' },
          length: { get: () => 1 },
        });
        return plugin;
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => plugins,
        configurable: true,
      });

      // Platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
        configurable: true,
      });

      // Hardware
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4 + Math.floor(Math.random() * 8),
        configurable: true,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => [4, 8, 16][Math.floor(Math.random() * 3)],
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0,
        configurable: true,
      });

      // WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };

      // Permissions API
      const originalQuery = window.navigator.permissions.query;
      (window.navigator.permissions as any).query = (params: any) => {
        if (params.name === 'notifications') {
          return Promise.resolve({ state: 'prompt', onchange: null } as any);
        }
        return originalQuery.call(navigator.permissions, params);
      };

      // Connection API
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
        }),
        configurable: true,
      });
    });
  }

  /**
   * Simulate human-like behavior - more realistic
   */
  private async simulateHumanBehavior(page: Page): Promise<void> {
    const viewport = page.viewport();
    if (!viewport) return;

    // Initial pause - like human reading
    await this.delay(500 + Math.random() * 1000);

    // Bezier curve mouse movements (more human-like)
    const movements = 3 + Math.floor(Math.random() * 3);
    let lastX = Math.floor(viewport.width / 2);
    let lastY = Math.floor(viewport.height / 2);

    for (let i = 0; i < movements; i++) {
      const targetX = Math.floor(Math.random() * viewport.width * 0.8 + viewport.width * 0.1);
      const targetY = Math.floor(Math.random() * viewport.height * 0.8 + viewport.height * 0.1);
      
      // Move in multiple small steps with varying speeds
      const steps = 15 + Math.floor(Math.random() * 15);
      for (let step = 0; step < steps; step++) {
        const progress = step / steps;
        // Ease-in-out curve
        const eased = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const x = lastX + (targetX - lastX) * eased;
        const y = lastY + (targetY - lastY) * eased;
        await page.mouse.move(x, y);
        await this.delay(10 + Math.random() * 20);
      }
      
      lastX = targetX;
      lastY = targetY;
      await this.delay(100 + Math.random() * 300);
    }

    // Random scrolls - like reading content
    const scrolls = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < scrolls; i++) {
      const scrollAmount = 100 + Math.floor(Math.random() * 400);
      await page.evaluate((amount) => {
        window.scrollBy({ top: amount, behavior: 'smooth' });
      }, scrollAmount);
      await this.delay(300 + Math.random() * 700);
    }

    // Sometimes scroll back up
    if (Math.random() > 0.5) {
      await page.evaluate(() => {
        window.scrollBy({ top: -150, behavior: 'smooth' });
      });
      await this.delay(200 + Math.random() * 300);
    }

    // Final pause
    await this.delay(300 + Math.random() * 500);
  }

  /**
   * Find lot page URL from search results
   * CRITICAL: This is needed to get full auction data
   */
  private async findLotPageUrl(
    page: Page,
    vin: string,
    source: DiscoveredSource,
  ): Promise<string | null> {
    try {
      // Domain-specific selectors for lot links
      const lotLinkSelectors: Record<string, string[]> = {
        'copart.com': [
          'a[href*="/lot/"]',
          'a[href*="/lotSearchResults/"]',
          '.lot-number a',
          '[data-uname="lotsearchLotHyperlink"]',
        ],
        'iaai.com': [
          'a[href*="/VehicleDetail/"]',
          'a[href*="/vehicle/"]',
          '.vehicle-details a',
          '.stock-number a',
        ],
        'autobidmaster.com': [
          'a[href*="/en/carfinder/lot/"]',
          'a[href*="/lot/"]',
          '.lot-link',
        ],
        'salvagereseller.com': [
          'a[href*="/lot/"]',
          'a[href*="/vehicle/"]',
        ],
        'bidfax.info': [
          'a[href*="/lot/"]',
          'a[href*="/copart/"]',
          'a[href*="/iaai/"]',
        ],
        'poctra.com': [
          'a[href*="/lot/"]',
          'a[href*="/vehicle/"]',
        ],
        'stat.vin': [
          'a[href*="/cars/"]',
          'a[href*="/lot/"]',
        ],
      };

      // Generic selectors for any site
      const genericSelectors = [
        'a[href*="/lot/"]',
        'a[href*="/vehicle/"]',
        'a[href*="/item/"]',
        'a[href*="/VehicleDetail"]',
      ];

      const selectors = lotLinkSelectors[source.domain] || genericSelectors;

      // Try to find lot link
      for (const selector of selectors) {
        try {
          const lotLink = await page.$eval(selector, (el) => {
            const anchor = el as HTMLAnchorElement;
            return anchor.href || null;
          }).catch(() => null);

          if (lotLink && lotLink.startsWith('http')) {
            return lotLink;
          }
        } catch {}
      }

      // Fallback: Find any link containing our VIN
      const vinLink = await page.evaluate((targetVin: string) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          if (href.includes(targetVin) || href.includes('/lot/') || href.includes('/vehicle/')) {
            return href;
          }
        }
        return null;
      }, vin);

      return vinLink;

    } catch (error) {
      this.logger.debug(`[Stealth] Error finding lot URL: ${error}`);
      return null;
    }
  }

  /**
   * Special extraction for Copart - structured lot page data
   */
  private async extractCopartData(
    page: Page,
    vin: string,
    source: DiscoveredSource,
  ): Promise<ExtractedVehicle | null> {
    this.logger.log(`[Stealth] Using Copart special extraction for ${vin}`);
    
    const data = await page.evaluate((targetVin: string) => {
      const bodyText = document.body.innerText || '';
      const html = document.body.innerHTML || '';
      
      // VIN validation
      const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
      const vinMatches: string[] = bodyText.match(vinRegex) || [];
      const foundVin = vinMatches.find((v: string) => v.toUpperCase() === targetVin.toUpperCase()) || null;
      
      if (!foundVin) return null;
      
      // Lot number - Copart specific patterns
      let lotNumber: string | null = null;
      const lotMatch = bodyText.match(/Lot\s*#?\s*:?\s*(\d{7,9})/i) ||
                       bodyText.match(/Stock\s*#?\s*:?\s*(\d+)/i) ||
                       html.match(/data-lot[="](\d{7,9})/i);
      if (lotMatch) lotNumber = lotMatch[1];
      
      // Title/Vehicle Name - look for H1 or specific selectors
      let title: string | null = null;
      const h1 = document.querySelector('h1');
      if (h1) {
        title = h1.textContent?.trim() || null;
      }
      
      // Parse year/make/model from title
      let year: number | null = null;
      let make: string | null = null;
      let model: string | null = null;
      
      if (title) {
        const titleMatch = title.match(/^(\d{4})\s+([A-Z][A-Z\-]+)\s+(.+)/i);
        if (titleMatch) {
          year = parseInt(titleMatch[1], 10);
          make = titleMatch[2].toUpperCase();
          model = titleMatch[3].trim();
        }
      }
      
      // Helper to find label:value pairs
      const findLabel = (labels: string[]): string | null => {
        for (const label of labels) {
          const patterns = [
            new RegExp(label + '\\s*[:\\|]\\s*([^\\n\\|]+)', 'i'),
            new RegExp('<[^>]*>' + label + '<\\/[^>]*>\\s*<[^>]*>([^<]+)', 'i'),
          ];
          for (const pattern of patterns) {
            const match = bodyText.match(pattern) || html.match(pattern);
            if (match && match[1]) {
              const value = match[1].trim();
              if (value && value.length < 100) return value;
            }
          }
        }
        return null;
      };
      
      // Current Bid/Price
      let price: number | null = null;
      const priceText = findLabel(['Current Bid', 'High Bid', 'Buy It Now', 'Final Bid']);
      if (priceText) {
        const priceMatch = priceText.match(/\$?([\d,]+)/);
        if (priceMatch) {
          price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        }
      }
      // Fallback - look for prominent price
      if (!price) {
        const bigPrice = bodyText.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:USD)?/);
        if (bigPrice) {
          const p = parseInt(bigPrice[1].replace(/,/g, ''), 10);
          if (p > 100 && p < 500000) price = p;
        }
      }
      
      // Odometer
      let mileage: number | null = null;
      const odometerText = findLabel(['Odometer', 'Mileage', 'Miles']);
      if (odometerText) {
        const odomMatch = odometerText.match(/([\d,]+)\s*(mi|km|miles)?/i);
        if (odomMatch) {
          mileage = parseInt(odomMatch[1].replace(/,/g, ''), 10);
        }
      }
      
      // Damage
      const primaryDamage = findLabel(['Primary Damage', 'Damage Type', 'Primary']);
      const secondaryDamage = findLabel(['Secondary Damage', 'Secondary']);
      
      // Title Status
      const titleStatus = findLabel(['Title', 'Title Code', 'Doc Type', 'Sale Title']);
      
      // Location
      const location = findLabel(['Location', 'Yard', 'Sale Location', 'Branch']);
      
      // Sale Date
      const saleDate = findLabel(['Sale Date', 'Auction Date', 'Sale Time']);
      
      // Additional details
      const fuel = findLabel(['Fuel', 'Fuel Type', 'Engine Type']);
      const transmission = findLabel(['Transmission', 'Trans']);
      const drive = findLabel(['Drive', 'Drive Type', 'Drivetrain']);
      const color = findLabel(['Color', 'Exterior Color', 'Ext Color']);
      const engine = findLabel(['Engine', 'Engine Size', 'Cylinders']);
      const bodyStyle = findLabel(['Body Style', 'Body Type', 'Vehicle Type']);
      const keys = findLabel(['Keys', 'Key Present']);
      const seller = findLabel(['Seller', 'Seller Type']);
      
      // Images - Copart specific
      const images: string[] = [];
      document.querySelectorAll('img[src*="cs.copart"], img[src*="cloudfront"], img[data-src*="lot"]').forEach(img => {
        const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
        if (src && src.length > 30 && !src.includes('logo') && !src.includes('icon')) {
          images.push(src);
        }
      });
      // Also check for carousel images
      document.querySelectorAll('[class*="carousel"] img, [class*="gallery"] img, [class*="thumbnail"] img').forEach(img => {
        const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
        if (src && src.length > 30 && !images.includes(src)) {
          images.push(src);
        }
      });
      
      return {
        foundVin,
        lotNumber,
        title,
        year,
        make,
        model,
        price,
        mileage,
        primaryDamage,
        secondaryDamage,
        titleStatus,
        location,
        saleDate,
        fuel,
        transmission,
        drive,
        color,
        engine,
        bodyStyle,
        keys,
        seller,
        images: images.slice(0, 20),
      };
    }, vin);
    
    if (!data || !data.foundVin) {
      this.logger.warn(`[Stealth] Copart: VIN not found on page`);
      return null;
    }
    
    const confidence = this.calculateConfidence(data, vin);
    
    this.logger.log(
      `[Stealth] Copart: lot=${data.lotNumber}, price=${data.price}, mileage=${data.mileage}, damage=${data.primaryDamage}, images=${data.images.length}`
    );
    
    return {
      vin: data.foundVin.toUpperCase(),
      title: data.title || `${data.year || ''} ${data.make || ''} ${data.model || ''}`.trim() || undefined,
      year: data.year || undefined,
      make: data.make || undefined,
      model: data.model || undefined,
      lotNumber: data.lotNumber || undefined,
      location: data.location || undefined,
      price: data.price || undefined,
      images: data.images || [],
      damageType: data.primaryDamage || undefined,
      secondaryDamage: data.secondaryDamage || undefined,
      mileage: data.mileage || undefined,
      odometerUnit: 'mi',
      titleStatus: data.titleStatus || undefined,
      fuel: data.fuel || undefined,
      transmission: data.transmission || undefined,
      drive: data.drive || undefined,
      bodyStyle: data.bodyStyle || undefined,
      seller: data.seller || undefined,
      saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
      engine: data.engine || undefined,
      color: data.color || undefined,
      source: source.name,
      sourceUrl: source.url,
      sourceTier: source.tier,
      confidence,
      extractedAt: new Date(),
      responseTime: 0,
    };
  }

  /**
   * Special extraction for IAAI - Insurance Auto Auctions
   */
  private async extractIAAIData(
    page: Page,
    vin: string,
    source: DiscoveredSource,
  ): Promise<ExtractedVehicle | null> {
    this.logger.log(`[Stealth] Using IAAI special extraction for ${vin}`);
    
    const data = await page.evaluate((targetVin: string) => {
      const bodyText = document.body.innerText || '';
      const html = document.body.innerHTML || '';
      
      // VIN validation
      const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
      const vinMatches: string[] = bodyText.match(vinRegex) || [];
      const foundVin = vinMatches.find((v: string) => v.toUpperCase() === targetVin.toUpperCase()) || null;
      
      if (!foundVin) return null;
      
      // Stock/Lot number - IAAI uses "Stock #"
      let lotNumber: string | null = null;
      const stockMatch = bodyText.match(/Stock\s*#?\s*:?\s*(\d{7,10})/i) ||
                         bodyText.match(/Item\s*#?\s*:?\s*(\d+)/i) ||
                         html.match(/data-stock[="](\d+)/i);
      if (stockMatch) lotNumber = stockMatch[1];
      
      // Title/Vehicle Name
      let title: string | null = null;
      const h1 = document.querySelector('h1, .vehicle-title, [class*="title"]');
      if (h1) {
        title = h1.textContent?.trim() || null;
      }
      
      // Parse year/make/model
      let year: number | null = null;
      let make: string | null = null;
      let model: string | null = null;
      
      if (title) {
        const titleMatch = title.match(/^(\d{4})\s+([A-Z][A-Z\-]+)\s+(.+)/i);
        if (titleMatch) {
          year = parseInt(titleMatch[1], 10);
          make = titleMatch[2].toUpperCase();
          model = titleMatch[3].trim();
        }
      }
      
      // Helper for IAAI label extraction
      const findLabel = (labels: string[]): string | null => {
        for (const label of labels) {
          // IAAI uses table-like structure and spans
          const patterns = [
            new RegExp(label + '\\s*[:\\|]\\s*([^\\n\\|]+)', 'i'),
            new RegExp('<span[^>]*>' + label + '<\\/span>\\s*<span[^>]*>([^<]+)', 'i'),
            new RegExp('<td[^>]*>' + label + '<\\/td>\\s*<td[^>]*>([^<]+)', 'i'),
          ];
          for (const pattern of patterns) {
            const match = bodyText.match(pattern) || html.match(pattern);
            if (match && match[1]) {
              const value = match[1].trim();
              if (value && value.length < 100 && value !== '-') return value;
            }
          }
        }
        return null;
      };
      
      // Current Bid/Price - IAAI specific
      let price: number | null = null;
      const priceText = findLabel(['Current Bid', 'Bid Amount', 'Buy Now Price', 'High Bid']);
      if (priceText) {
        const priceMatch = priceText.match(/\$?([\d,]+)/);
        if (priceMatch) {
          price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        }
      }
      // Fallback
      if (!price) {
        const bigPrice = bodyText.match(/(?:Current Bid|Price)[:\s]*\$?\s*([\d,]+)/i);
        if (bigPrice) {
          const p = parseInt(bigPrice[1].replace(/,/g, ''), 10);
          if (p > 100 && p < 500000) price = p;
        }
      }
      
      // Odometer - IAAI format
      let mileage: number | null = null;
      const odometerText = findLabel(['Odometer', 'Odometer Reading', 'Miles']);
      if (odometerText) {
        const odomMatch = odometerText.match(/([\d,]+)/);
        if (odomMatch) {
          mileage = parseInt(odomMatch[1].replace(/,/g, ''), 10);
        }
      }
      
      // Damage - IAAI specific labels
      const primaryDamage = findLabel(['Primary Damage', 'Loss Type', 'Damage']);
      const secondaryDamage = findLabel(['Secondary Damage', 'Minor Damage', 'Additional Damage']);
      
      // Title/Doc Type
      const titleStatus = findLabel(['Title/Sale Doc', 'Sale Document', 'Title Type', 'Doc Type']);
      
      // Location/Branch
      const location = findLabel(['Branch', 'Location', 'Branch Location', 'Yard']);
      
      // Sale Info
      const saleDate = findLabel(['Sale Date', 'Auction Date', 'Sale']);
      
      // Vehicle Details
      const fuel = findLabel(['Fuel Type', 'Fuel']);
      const transmission = findLabel(['Transmission']);
      const drive = findLabel(['Drive Line Type', 'Drive Type', 'Drive']);
      const color = findLabel(['Color', 'Exterior Color']);
      const engine = findLabel(['Engine', 'Engine Type', 'Cylinders']);
      const bodyStyle = findLabel(['Body Style', 'Body']);
      const keys = findLabel(['Keys', 'Keys Present', 'Key']);
      const seller = findLabel(['Seller', 'Seller Type', 'Sold By']);
      
      // Loss Type (IAAI specific)
      const lossType = findLabel(['Loss Type', 'Claim Type']);
      
      // Images - IAAI specific
      const images: string[] = [];
      document.querySelectorAll('img[src*="iaai"], img[src*="vehicleimage"], img[data-src*="iaai"]').forEach(img => {
        const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
        if (src && src.length > 30 && !src.includes('logo') && !src.includes('icon')) {
          images.push(src);
        }
      });
      // Check gallery/carousel
      document.querySelectorAll('[class*="gallery"] img, [class*="slider"] img, .vehicle-image img').forEach(img => {
        const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
        if (src && src.length > 30 && !images.includes(src)) {
          images.push(src);
        }
      });
      
      return {
        foundVin,
        lotNumber,
        title,
        year,
        make,
        model,
        price,
        mileage,
        primaryDamage: primaryDamage || lossType,
        secondaryDamage,
        titleStatus,
        location,
        saleDate,
        fuel,
        transmission,
        drive,
        color,
        engine,
        bodyStyle,
        keys,
        seller,
        images: images.slice(0, 20),
      };
    }, vin);
    
    if (!data || !data.foundVin) {
      this.logger.warn(`[Stealth] IAAI: VIN not found on page`);
      return null;
    }
    
    const confidence = this.calculateConfidence(data, vin);
    
    this.logger.log(
      `[Stealth] IAAI: stock=${data.lotNumber}, price=${data.price}, mileage=${data.mileage}, damage=${data.primaryDamage}, images=${data.images.length}`
    );
    
    return {
      vin: data.foundVin.toUpperCase(),
      title: data.title || `${data.year || ''} ${data.make || ''} ${data.model || ''}`.trim() || undefined,
      year: data.year || undefined,
      make: data.make || undefined,
      model: data.model || undefined,
      lotNumber: data.lotNumber || undefined,
      location: data.location || undefined,
      price: data.price || undefined,
      images: data.images || [],
      damageType: data.primaryDamage || undefined,
      secondaryDamage: data.secondaryDamage || undefined,
      mileage: data.mileage || undefined,
      odometerUnit: 'mi',
      titleStatus: data.titleStatus || undefined,
      fuel: data.fuel || undefined,
      transmission: data.transmission || undefined,
      drive: data.drive || undefined,
      bodyStyle: data.bodyStyle || undefined,
      seller: data.seller || undefined,
      saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
      engine: data.engine || undefined,
      color: data.color || undefined,
      source: source.name,
      sourceUrl: source.url,
      sourceTier: source.tier,
      confidence,
      extractedAt: new Date(),
      responseTime: 0,
    };
  }

  /**
   * Calculate confidence score based on extracted data
   */
  private calculateConfidence(data: any, targetVin: string): number {
    let confidence = 0.4; // Base
    
    const normalizedTarget = targetVin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const normalizedFound = (data.foundVin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    
    if (normalizedFound === normalizedTarget && normalizedFound.length === 17) {
      confidence += 0.25; // VIN match
    }
    if (data.lotNumber) confidence += 0.1;
    if (data.price && data.price > 0) confidence += 0.1;
    if (data.mileage && data.mileage > 0) confidence += 0.05;
    if (data.images && data.images.length > 0) confidence += 0.05;
    if (data.year && data.make) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Special extraction for stat.vin - they have excellent structured data
   */
  private async extractStatVinData(
    page: Page,
    vin: string,
    source: DiscoveredSource,
  ): Promise<ExtractedVehicle | null> {
    this.logger.log(`[Stealth] Using StatVin special extraction for ${vin}`);
    
    // First get the raw body text for debugging
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    
    // Check if VIN exists
    if (!bodyText.toUpperCase().includes(vin.toUpperCase())) {
      this.logger.warn(`[Stealth] StatVin: VIN not found on page`);
      return null;
    }
    
    // Extract title from H1
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1?.textContent?.trim() || null;
    });
    
    // Parse title for year/make/model
    let year: number | null = null;
    let make: string | null = null;
    let model: string | null = null;
    
    if (title) {
      const match = title.match(/^([A-Z]+)\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)?)\s+(20[0-2]\d|19[89]\d)/i);
      if (match) {
        make = match[1].toUpperCase();
        model = match[2].trim();
        year = parseInt(match[3], 10);
      }
    }
    
    // Extract price - find first $ after "Current Bid"
    let price: number | null = null;
    const bidIdx = bodyText.indexOf('Current Bid');
    if (bidIdx > -1) {
      const after = bodyText.substring(bidIdx, bidIdx + 100);
      const priceMatch = after.match(/\$([\d,]+(?:\.\d{2})?)/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(/,/g, ''));
        this.logger.debug(`[Stealth] StatVin price found: $${price}`);
      }
    }
    
    // Extract Buy Now price
    let buyNowPrice: number | null = null;
    const buyIdx = bodyText.toLowerCase().indexOf('buy');
    if (buyIdx > -1) {
      const after = bodyText.substring(buyIdx, buyIdx + 80);
      const match = after.match(/\$([\d,]+)/);
      if (match) {
        const val = parseInt(match[1].replace(/,/g, ''), 10);
        if (val > 100) buyNowPrice = val;
      }
    }
    
    // Auction source
    let auctionName: string | null = null;
    if (bodyText.includes('IAAI')) auctionName = 'IAAI';
    else if (bodyText.includes('Copart')) auctionName = 'Copart';
    
    // Mileage - look for pattern like "78 360 mi"
    let mileage: number | null = null;
    const mileageMatch = bodyText.match(/(\d[\d\s,]*\d)\s*(?:mi|km|miles)/i);
    if (mileageMatch) {
      mileage = parseInt(mileageMatch[1].replace(/[\s,]/g, ''), 10);
    }
    
    // Images
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map(img => img.src || img.getAttribute('data-src') || '')
        .filter(src => src.length > 50 && !src.includes('logo') && !src.includes('icon'))
        .slice(0, 20);
    });
    
    this.logger.log(
      `[Stealth] StatVin: vin=${vin}, year=${year}, make=${make}, model=${model}, price=${price}, buyNow=${buyNowPrice}, mileage=${mileage}, images=${images.length}`
    );

    return {
      vin: vin.toUpperCase(),
      title: title || `${year || ''} ${make || ''} ${model || ''}`.trim() || undefined,
      year: year || undefined,
      make: make || undefined,
      model: model || undefined,
      price: price || buyNowPrice || undefined,
      images: images || [],
      mileage: mileage || undefined,
      odometerUnit: 'mi',
      source: source.name,
      sourceUrl: source.url,
      sourceTier: source.tier,
      confidence: 0.90,
      extractedAt: new Date(),
      responseTime: 0,
    };
  }

  /**
   * Extract vehicle data from page - aggressive parsing
   */
  private async extractVehicleData(
    page: Page,
    vin: string,
    source: DiscoveredSource,
  ): Promise<ExtractedVehicle | null> {
    // Special extraction for stat.vin - they have structured data
    if (source.domain === 'stat.vin') {
      return this.extractStatVinData(page, vin, source);
    }
    
    // Special extraction for Copart
    if (source.domain === 'copart.com') {
      return this.extractCopartData(page, vin, source);
    }
    
    // Special extraction for IAAI
    if (source.domain === 'iaai.com') {
      return this.extractIAAIData(page, vin, source);
    }
    
    const data = await page.evaluate((targetVin) => {
      const getText = (selector: string): string | null => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || null;
      };

      const bodyText = document.body.innerText;
      const pageHtml = document.body.innerHTML;

      // Find VIN on page - STRICT MATCH ONLY (P0 fix)
      const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
      const vinMatches: string[] = bodyText.match(vinRegex) || [];
      // P0 FIX: Only accept EXACT VIN match - do NOT fallback to first VIN
      const foundVin = vinMatches.find((v: string) => v.toUpperCase() === targetVin.toUpperCase()) || null;

      // Extract year from text - ONLY from context near VIN
      // First, find all text blocks containing our VIN
      let year: number | null = null;
      let make: string | null = null;
      let model: string | null = null;
      
      // Find context around VIN (200 chars before and after)
      const vinIndex = bodyText.toUpperCase().indexOf(targetVin.toUpperCase());
      const contextStart = Math.max(0, vinIndex - 200);
      const contextEnd = Math.min(bodyText.length, vinIndex + 217 + 200); // VIN is 17 chars
      const vinContext = vinIndex >= 0 ? bodyText.slice(contextStart, contextEnd) : '';
      
      // Extract year/make from context near VIN ONLY
      if (vinContext) {
        const yearPattern = /\b(19[89]\d|20[0-2]\d)\b\s+(TESLA|TOYOTA|HONDA|FORD|CHEVROLET|BMW|MERCEDES|AUDI|NISSAN|PORSCHE|VOLKSWAGEN|HYUNDAI|KIA|MAZDA|SUBARU|JEEP|DODGE|RAM|GMC|CADILLAC|LEXUS|INFINITI|ACURA|VOLVO|LAND ROVER|JAGUAR)/i;
        const yearMatch = vinContext.match(yearPattern);
        if (yearMatch) {
          year = parseInt(yearMatch[1], 10);
          make = yearMatch[2].toUpperCase();
        }
      }
      
      // If no year/make from context, don't fall back to page-wide search
      // LocalDecoder will provide this data from VIN decoding

      // Extract model - only if we have make from VIN context
      if (make && vinContext) {
        const modelPattern = new RegExp(make + '\\s+(MODEL\\s*[SX3Y]|[A-Z0-9][A-Z0-9\\-\\s]{1,20})', 'i');
        const modelMatch = vinContext.match(modelPattern);
        if (modelMatch) {
          model = modelMatch[1].trim();
        }
      }

      // Extract title - comprehensive approach
      let title: string | null = null;
      // Try to find pattern like "2012 TESLA MODEL S"
      const titlePattern = /\b(19[89]\d|20[0-2]\d)\s+([A-Z][A-Z\s\-]+[A-Z0-9])\b/gi;
      const titleMatches = bodyText.match(titlePattern);
      if (titleMatches && titleMatches.length > 0) {
        // Find the one that matches our make
        for (const t of titleMatches) {
          if (make && t.toUpperCase().includes(make)) {
            title = t;
            break;
          }
        }
        if (!title) title = titleMatches[0];
      }

      // Lot number - multiple patterns
      let lotNumber: string | null = null;
      const lotPatterns = [
        /Lot\s*#?\s*(\d{7,9})/i,
        /Lot\s*(?:Number|ID)?[:\s]*(\d+)/i,
        /Stock\s*#?\s*(\d+)/i,  // IAAI uses Stock
        /(\d{7,9})\s*Watch/i, // Copart specific
      ];
      for (const pattern of lotPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          lotNumber = match[1];
          break;
        }
      }

      // 🔥 LABEL-BASED EXTRACTION (for lot page data)
      const find = (label: string): string | null => {
        const patterns = [
          new RegExp(label + '\\s*:\\s*([^\\n]+)', 'i'),
          new RegExp(label + '\\s+([^\\n]+)', 'i'),
        ];
        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match) {
            return match[1].trim().split('\n')[0].trim();
          }
        }
        return null;
      };

      // Price - multiple patterns
      let price: number | null = null;
      const pricePatterns = [
        /retail\s*value[:\s]*\$?([\d,]+)/i,
        /current\s*bid[:\s]*\$?([\d,]+)/i,
        /high\s*bid[:\s]*\$?([\d,]+)/i,
        /buy\s*(?:it\s*)?now[:\s]*\$?([\d,]+)/i,
        /price[:\s]*\$?([\d,]+)/i,
        /bid[:\s]*\$?([\d,]+)/i,
        /\$([\d,]+)/,
      ];
      for (const pattern of pricePatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const parsed = parseInt(match[1].replace(/,/g, ''), 10);
          if (parsed > 100 && parsed < 1000000) { // Reasonable car price range
            price = parsed;
            break;
          }
        }
      }

      // Mileage/Odometer - ENHANCED
      let mileage: number | null = null;
      let odometerUnit: string | null = null;
      const mileagePatterns = [
        /Odometer[:\s]*(\d{1,3},?\d{3})\s*(mi|km|miles?)?/i,
        /(\d{1,3},?\d{3})\s*(?:miles?|mi)\b/i,
        /mileage[:\s]*(\d{1,3},?\d{3})/i,
      ];
      for (const pattern of mileagePatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          mileage = parseInt(match[1].replace(/,/g, ''), 10);
          odometerUnit = match[2]?.toLowerCase().startsWith('k') ? 'km' : 'mi';
          break;
        }
      }

      // Damage type - ENHANCED with label extraction
      let damage: string | null = null;
      let secondaryDamage: string | null = null;
      
      damage = find('Primary Damage') || find('Damage Type') || find('Damage');
      secondaryDamage = find('Secondary Damage');
      
      if (!damage) {
        const damagePatterns = [
          /(Front End|Rear End|Side|Roll Over|Flood|Fire|Mechanical|Hail|Vandalism|All Over|Minor Dent|Burn)/i,
        ];
        for (const pattern of damagePatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            damage = match[1].trim();
            break;
          }
        }
      }

      // Title Status - NEW
      const titleStatus = find('Title') || find('Title Code') || find('Title Status');
      
      // Fuel Type - NEW
      const fuel = find('Fuel') || find('Fuel Type');
      
      // Transmission - NEW  
      const transmission = find('Transmission');
      
      // Drive - NEW
      const drive = find('Drive') || find('Drive Type');
      
      // Body Style - NEW
      const bodyStyle = find('Body Style') || find('Body Type');
      
      // Seller - NEW
      const seller = find('Seller');
      
      // Sale Date - NEW
      const saleDate = find('Sale Date') || find('Auction Date');

      // Engine - NEW
      const engine = find('Engine') || find('Engine Type');
      
      // Color - NEW
      const color = find('Color') || find('Exterior Color');

      // Images
      const images: string[] = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || img.getAttribute('data-src') || '';
        if (src.length > 50 && 
            (src.includes('lot') || src.includes('vehicle') || src.includes('image')) &&
            !src.includes('icon') && !src.includes('logo') && !src.includes('placeholder')) {
          images.push(src);
        }
      });

      // Location
      let location: string | null = null;
      const locationPatterns = [
        /location[:\s]*([A-Za-z\s]+,\s*[A-Z]{2})/i,
        /yard[:\s]*([A-Za-z\s]+)/i,
      ];
      for (const pattern of locationPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          location = match[1].trim();
          break;
        }
      }

      return {
        foundVin: foundVin?.toUpperCase() || null,
        title,
        price,
        images: images.slice(0, 20),
        lotNumber,
        year,
        make,
        model,
        mileage,
        odometerUnit,
        damage,
        secondaryDamage,
        location,
        // NEW FIELDS from lot page
        titleStatus,
        fuel,
        transmission,
        drive,
        bodyStyle,
        seller,
        saleDate,
        engine,
        color,
      };
    }, vin);

    // Calculate confidence
    let confidence = 0.4; // Base for stealth scraping
    
    // P0 CRITICAL: VIN VALIDATION
    const normalizedTargetVin = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const normalizedFoundVin = (data.foundVin || '').replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const vinMatched = normalizedFoundVin === normalizedTargetVin && normalizedFoundVin.length === 17;
    
    if (vinMatched) {
      confidence += 0.25; // VIN match bonus
    } else if (data.foundVin) {
      // VIN found but doesn't match - P0 CRITICAL BUG FIX
      this.logger.warn(
        `[Stealth] P0 REJECT: VIN mismatch from ${source.name}. ` +
        `Expected: ${normalizedTargetVin}, Got: ${normalizedFoundVin}`
      );
      confidence -= 0.5; // Heavy penalty
    }
    
    if (data.price) confidence += 0.1;
    if (data.images.length > 0) confidence += 0.05;
    if (data.title || (data.year && data.make)) confidence += 0.15;
    if (data.lotNumber) confidence += 0.1;

    this.logger.log(
      `[Stealth] ${source.name}: vin=${!!data.foundVin}, vinMatched=${vinMatched}, lot=${data.lotNumber}, price=${data.price}, odometer=${data.mileage}, damage=${data.damage}, conf=${confidence.toFixed(2)}`
    );

    // Skip if no useful data found OR VIN doesn't match (P0)
    // P0 CRITICAL: Must have VIN match to return data
    if (!data.foundVin) {
      this.logger.warn(`[Stealth] ${source.name}: VIN not found on page - REJECTING (P0 rule)`);
      return null;
    }
    
    // P0: If VIN found but doesn't match - REJECT completely
    if (data.foundVin && !vinMatched) {
      this.logger.warn(`[Stealth] ${source.name}: Rejecting - wrong vehicle returned`);
      return null;
    }

    return {
      vin: data.foundVin || vin.toUpperCase(),
      title: data.title || (data.year && data.make ? `${data.year} ${data.make} ${data.model || ''}`.trim() : undefined),
      year: data.year || undefined,
      make: data.make || undefined,
      model: data.model || undefined,
      lotNumber: data.lotNumber || undefined,
      location: data.location || undefined,
      price: data.price || undefined,
      images: data.images,
      damageType: data.damage || undefined,
      secondaryDamage: data.secondaryDamage || undefined,
      mileage: data.mileage || undefined,
      odometerUnit: data.odometerUnit || 'mi',
      // NEW FIELDS from lot page extraction
      titleStatus: data.titleStatus || undefined,
      fuel: data.fuel || undefined,
      transmission: data.transmission || undefined,
      drive: data.drive || undefined,
      bodyStyle: data.bodyStyle || undefined,
      seller: data.seller || undefined,
      saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
      engine: data.engine || undefined,
      color: data.color || undefined,
      source: source.name,
      sourceUrl: source.url,
      sourceTier: source.tier,
      confidence,
      extractedAt: new Date(),
      responseTime: 0,
    };
  }

  /**
   * Get or create browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.browserLock;
      this.browserLock = (async () => {
        if (!this.browser) {
          this.logger.log('[Stealth] Launching FULL Chromium with stealth mode...');
          
          // Proxy configuration (set in .env: SCRAPING_PROXY=http://user:pass@host:port)
          const proxyServer = process.env.SCRAPING_PROXY;
          const proxyArgs = proxyServer ? [`--proxy-server=${proxyServer}`] : [];
          
          this.browser = await puppeteer.launch({
            headless: true, // Use true, not 'new' for Chromium 146+
            executablePath: BROWSER_PATH,
            ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-gpu',
              '--disable-dev-shm-usage',
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process',
              '--disable-web-security',
              '--disable-features=BlockInsecurePrivateNetworkRequests',
              '--window-size=1920,1080',
              '--start-maximized',
              '--disable-infobars',
              '--no-first-run',
              '--no-default-browser-check',
              '--disable-extensions',
              '--disable-component-extensions-with-background-pages',
              '--disable-default-apps',
              '--mute-audio',
              '--ignore-certificate-errors',
              '--lang=en-US,en',
              '--user-data-dir=/tmp/chromium-user-data-' + Date.now(),
              ...proxyArgs,
            ],
          }) as unknown as Browser;
          
          this.logger.log(`[Stealth] Browser launched: ${BROWSER_PATH}`);
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
