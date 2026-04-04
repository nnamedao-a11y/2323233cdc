/**
 * Resilient Fetch Service
 * 
 * HTTP client with fingerprint rotation and error handling
 */

import { Injectable } from '@nestjs/common';
import { HttpFingerprintService } from './http-fingerprint.service';
import { withRetry } from './retry.util';

export interface FetchOptions {
  referer?: string;
  kind?: 'html' | 'json' | 'rss' | 'any';
  timeout?: number;
  retries?: number;
}

@Injectable()
export class ResilientFetchService {
  constructor(
    private readonly fingerprintService: HttpFingerprintService,
  ) {}

  async getText(url: string, options?: FetchOptions): Promise<string> {
    const headers = this.fingerprintService.buildHeaders({
      referer: options?.referer,
      kind: options?.kind || 'any',
    });

    const timeout = options?.timeout || 30000;

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: headers as Record<string, string>,
            redirect: 'follow',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
          }

          return response.text();
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { retries: options?.retries ?? 2 }
    );
  }

  async getJson<T>(url: string, options?: FetchOptions): Promise<T> {
    const headers = this.fingerprintService.buildHeaders({
      referer: options?.referer,
      kind: 'json',
    });

    const timeout = options?.timeout || 30000;

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: headers as Record<string, string>,
            redirect: 'follow',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
          }

          return response.json() as Promise<T>;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { retries: options?.retries ?? 2 }
    );
  }

  async postJson<T>(url: string, body: any, options?: FetchOptions): Promise<T> {
    const headers = {
      ...this.fingerprintService.buildHeaders({ kind: 'json' }),
      'Content-Type': 'application/json',
    };

    const timeout = options?.timeout || 30000;

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            redirect: 'follow',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
          }

          return response.json() as Promise<T>;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { retries: options?.retries ?? 2 }
    );
  }

  async getRss(url: string, options?: FetchOptions): Promise<string> {
    return this.getText(url, { ...options, kind: 'rss' });
  }
}
