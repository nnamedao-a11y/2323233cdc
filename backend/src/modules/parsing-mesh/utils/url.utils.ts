/**
 * URL Utilities
 * 
 * Хелпери для роботи з URL
 */

/**
 * Витяг домену з URL
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Нормалізація URL
 */
export function normalizeUrl(url: string, baseUrl?: string): string {
  if (!url) return '';
  
  // Вже абсолютний URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Protocol-relative URL
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  
  // Relative URL
  if (baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }
  
  return url;
}

/**
 * Перевірка чи URL є зображенням
 */
export function isImageUrl(url: string): boolean {
  if (!url) return false;
  
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
  const lowerUrl = url.toLowerCase();
  
  // Перевіряємо розширення
  if (imageExtensions.some(ext => lowerUrl.includes(ext))) {
    return true;
  }
  
  // Перевіряємо CDN patterns
  const cdnPatterns = [
    'cloudinary.com',
    'imgix.net',
    'amazonaws.com',
    'cloudfront.net',
    'images.copart.com',
    'vis.iaai.com',
  ];
  
  return cdnPatterns.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Фільтрація placeholder/invalid зображень
 */
export function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  
  const invalidPatterns = [
    'placeholder',
    'loading',
    'spacer',
    'blank',
    'default',
    'no-image',
    'noimage',
    '1x1',
    'pixel',
    'data:image',
  ];
  
  const lowerUrl = url.toLowerCase();
  return !invalidPatterns.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Побудова URL з параметрами
 */
export function buildUrl(base: string, params: Record<string, string | number>): string {
  const url = new URL(base);
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  
  return url.href;
}

/**
 * Список excluded доменів для discovery
 */
export const EXCLUDED_DOMAINS = [
  'google.com', 'google.co', 'goo.gl',
  'bing.com',
  'yahoo.com',
  'duckduckgo.com',
  'facebook.com', 'fb.com',
  'twitter.com', 'x.com',
  'instagram.com',
  'youtube.com', 'youtu.be',
  'linkedin.com',
  'pinterest.com',
  'reddit.com',
  'wikipedia.org',
  'amazon.com',
  'ebay.com', // окремий адаптер
  'craigslist.org',
  'tiktok.com',
];

/**
 * Перевірка чи домен виключений
 */
export function isExcludedDomain(domain: string): boolean {
  if (!domain) return true;
  const lowerDomain = domain.toLowerCase();
  return EXCLUDED_DOMAINS.some(ex => lowerDomain.includes(ex));
}
