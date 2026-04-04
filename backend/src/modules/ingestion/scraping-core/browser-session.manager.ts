/**
 * BrowserSessionManager - Manages Puppeteer browser lifecycle
 * 
 * Responsibilities:
 * - Launch/close browser
 * - Proxy configuration
 * - Page creation with proper settings
 * - Browser recycle after N pages
 * - Cleanup listeners
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { ProxyConfig } from './parser.types';

// Default proxy config
const DEFAULT_PROXY: ProxyConfig = {
  host: '31.6.33.171',
  httpPort: 50100,
  socks5Port: 50101,
  username: 'cryptomagic2x0Ccas',
  password: '989KrcYrU7',
};

export class BrowserSessionManager {
  private browser: Browser | null = null;
  private pagesUsed = 0;
  private totalPagesCreated = 0;
  private browserRestarts = 0;

  constructor(
    private readonly proxyConfig: ProxyConfig | null = DEFAULT_PROXY,
    private readonly maxPagesPerBrowser = 25,
    private readonly useProxy = true,
  ) {}

  /**
   * Get or create browser instance
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.launchBrowser();
    }
    return this.browser!;
  }

  /**
   * Launch new browser with configured settings
   */
  private async launchBrowser(): Promise<void> {
    // Find Chromium executable
    const possiblePaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROMIUM_PATH,
      '/pw-browsers/chromium_headless_shell-1208/chrome-linux/headless_shell',
      '/pw-browsers/chromium-1208/chrome-linux/chrome',
      '/root/.cache/ms-playwright/chromium-1208/chrome-linux/chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ].filter(Boolean);

    let executablePath = '/usr/bin/chromium';
    const fs = require('fs');
    for (const path of possiblePaths) {
      if (path && fs.existsSync(path)) {
        executablePath = path;
        break;
      }
    }

    console.log(`[BrowserSessionManager] Launching browser with Chromium: ${executablePath}`);

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080',
      '--single-process',
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ];

    // Add proxy if enabled
    if (this.useProxy && this.proxyConfig) {
      const proxyUrl = `http://${this.proxyConfig.host}:${this.proxyConfig.httpPort}`;
      args.push(`--proxy-server=${proxyUrl}`);
      console.log(`[BrowserSessionManager] Using proxy: ${proxyUrl}`);
    }

    this.browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args,
    });

    this.pagesUsed = 0;
    this.browserRestarts++;
    console.log(`[BrowserSessionManager] Browser launched (restart #${this.browserRestarts})`);
  }

  /**
   * Create new page with proper configuration
   */
  async newPage(): Promise<Page> {
    // Recycle browser if limit reached
    if (this.browser && this.pagesUsed >= this.maxPagesPerBrowser) {
      console.log(`[BrowserSessionManager] Page limit reached (${this.pagesUsed}/${this.maxPagesPerBrowser}), recycling browser...`);
      await this.recycleBrowser();
    }

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    this.pagesUsed++;
    this.totalPagesCreated++;

    // Configure page
    await page.setViewport({ width: 1440, height: 1200 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    // Proxy authentication
    if (this.useProxy && this.proxyConfig) {
      await page.authenticate({
        username: this.proxyConfig.username || '',
        password: this.proxyConfig.password || '',
      });
    }

    // Set timeouts
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    // Set headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    });

    console.log(`[BrowserSessionManager] Page created (#${this.totalPagesCreated}, session: ${this.pagesUsed}/${this.maxPagesPerBrowser})`);
    return page;
  }

  /**
   * Create page with request interception enabled (blocks images/fonts/media)
   */
  async newPageWithInterception(): Promise<Page> {
    const page = await this.newPage();

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    return page;
  }

  /**
   * Safely close a page
   */
  async closePage(page: Page): Promise<void> {
    try {
      // Remove all listeners to prevent memory leaks
      page.removeAllListeners();
      await page.close();
    } catch (error) {
      console.warn('[BrowserSessionManager] Error closing page:', error.message);
    }
  }

  /**
   * Recycle browser - close and relaunch
   */
  async recycleBrowser(): Promise<void> {
    console.log('[BrowserSessionManager] Recycling browser...');
    
    if (this.browser) {
      try {
        // Close all pages first
        const pages = await this.browser.pages();
        for (const page of pages) {
          try {
            page.removeAllListeners();
            await page.close();
          } catch {}
        }
        await this.browser.close();
      } catch (error) {
        console.warn('[BrowserSessionManager] Error during browser close:', error.message);
      }
      this.browser = null;
      this.pagesUsed = 0;
    }
  }

  /**
   * Close browser completely
   */
  async close(): Promise<void> {
    console.log('[BrowserSessionManager] Closing browser session...');
    await this.recycleBrowser();
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      pagesUsed: this.pagesUsed,
      totalPagesCreated: this.totalPagesCreated,
      browserRestarts: this.browserRestarts,
      maxPagesPerBrowser: this.maxPagesPerBrowser,
      proxyEnabled: this.useProxy,
    };
  }
}
