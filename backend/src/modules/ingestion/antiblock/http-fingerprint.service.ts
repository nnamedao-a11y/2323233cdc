/**
 * HTTP Fingerprint Service
 * 
 * Rotation of User-Agent and headers to avoid bot detection
 */

import { Injectable } from '@nestjs/common';

export interface HeaderFingerprint {
  'User-Agent': string;
  'Accept': string;
  'Accept-Language': string;
  'Cache-Control': string;
  'Pragma'?: string;
  'Referer'?: string;
  'Upgrade-Insecure-Requests'?: string;
  [key: string]: string | undefined;
}

@Injectable()
export class HttpFingerprintService {
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  ];

  private readonly acceptHeaders = {
    html: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    json: 'application/json,text/plain,*/*',
    rss: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    any: '*/*',
  };

  private readonly acceptLanguages = [
    'en-US,en;q=0.9',
    'en-US,en;q=0.9,ru;q=0.8',
    'en-GB,en;q=0.9',
    'en-US,en;q=0.5',
  ];

  buildHeaders(options?: { 
    referer?: string; 
    kind?: 'html' | 'json' | 'rss' | 'any';
  }): HeaderFingerprint {
    const userAgent = this.random(this.userAgents);
    const acceptLanguage = this.random(this.acceptLanguages);
    const kind = options?.kind || 'any';
    const accept = this.acceptHeaders[kind];

    return {
      'User-Agent': userAgent,
      'Accept': accept,
      'Accept-Language': acceptLanguage,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      ...(options?.referer ? { Referer: options.referer } : {}),
    };
  }

  getRandomUserAgent(): string {
    return this.random(this.userAgents);
  }

  private random<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }
}
