/**
 * Parser Types - shared types for scraping modules
 */

export interface ProxyConfig {
  host: string;
  port?: number;
  httpPort?: number;
  socks5Port?: number;
  server?: string;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks5';
}

export interface ScrapingOptions {
  maxPages?: number;
  scrollCount?: number;
  waitTime?: number;
  timeout?: number;
  useProxy?: boolean;
  proxy?: ProxyConfig;
}

export interface ScrapingResult {
  items: any[];
  method: 'xhr' | 'dom' | 'api';
  source: string;
  timestamp: Date;
  duration: number;
  errors?: string[];
}

export interface BrowserSessionOptions {
  headless?: boolean;
  useProxy?: boolean;
  proxyConfig?: ProxyConfig;
  viewport?: { width: number; height: number };
  userAgent?: string;
  timeout?: number;
}
