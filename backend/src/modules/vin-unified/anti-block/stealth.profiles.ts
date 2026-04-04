/**
 * Stealth Profiles for Anti-Block System
 * 
 * Multiple browser fingerprints to avoid detection
 */

export interface StealthProfile {
  userAgent: string;
  locale: string;
  timezoneId: string;
  viewport: { width: number; height: number };
  platform: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  languages: string[];
  colorScheme: 'light' | 'dark';
}

export const STEALTH_PROFILES: StealthProfile[] = [
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: { width: 1366, height: 768 },
    platform: 'Win32',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    languages: ['en-US', 'en'],
    colorScheme: 'light',
  },
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    viewport: { width: 1440, height: 900 },
    platform: 'MacIntel',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    languages: ['en-US', 'en'],
    colorScheme: 'light',
  },
  {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    viewport: { width: 1536, height: 864 },
    platform: 'Linux x86_64',
    hardwareConcurrency: 4,
    deviceMemory: 8,
    languages: ['en-US', 'en'],
    colorScheme: 'dark',
  },
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    locale: 'en-US',
    timezoneId: 'America/Denver',
    viewport: { width: 1920, height: 1080 },
    platform: 'Win32',
    hardwareConcurrency: 12,
    deviceMemory: 16,
    languages: ['en-US', 'en'],
    colorScheme: 'light',
  },
];

/**
 * Stealth Profile Manager
 */
export class StealthProfileManager {
  private idx = 0;

  next(): StealthProfile {
    const profile = STEALTH_PROFILES[this.idx % STEALTH_PROFILES.length];
    this.idx += 1;
    return profile;
  }

  random(): StealthProfile {
    return STEALTH_PROFILES[Math.floor(Math.random() * STEALTH_PROFILES.length)];
  }
}

/**
 * Stealth init script to remove headless detection
 */
export const STEALTH_INIT_SCRIPT = `
(() => {
  const override = (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, {
        get: () => value,
        configurable: true,
      });
    } catch (_) {}
  };

  // Hide webdriver
  override(navigator, 'webdriver', false);
  override(navigator, 'languages', ['en-US', 'en']);
  override(navigator, 'platform', 'Win32');
  override(navigator, 'hardwareConcurrency', 8);

  if ('deviceMemory' in navigator) {
    override(navigator, 'deviceMemory', 8);
  }

  // Add chrome object
  if (window.chrome === undefined) {
    window.chrome = {
      runtime: {},
      app: {},
      csi: () => {},
      loadTimes: () => {},
    };
  }

  // Override permissions
  const originalQuery = window.navigator.permissions?.query;
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) =>
      parameters && parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  }

  // WebGL vendor masking
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.call(this, parameter);
  };
})();
`;
