/**
 * Competitor Sources Configuration
 * 
 * Конфігурація джерел конкурентів для deep parsing
 * Кожне джерело має:
 * - name: унікальний ідентифікатор
 * - displayName: назва для UI
 * - searchUrl: функція генерації URL пошуку
 * - detailUrl: функція генерації URL деталей (опціонально)
 * - selectors: CSS селектори для extraction
 * - priority: пріоритет джерела
 * - rateLimit: затримка між запитами (ms)
 */

export interface CompetitorSource {
  name: string;
  displayName: string;
  baseUrl: string;
  searchUrl: (vin: string) => string;
  detailUrl?: (vin: string) => string;
  selectors?: {
    vin?: string;
    price?: string;
    title?: string;
    images?: string;
    lotNumber?: string;
    saleDate?: string;
    mileage?: string;
    damageType?: string;
  };
  priority: number;
  rateLimit: number;
  enabled: boolean;
}

export const COMPETITOR_SOURCES: CompetitorSource[] = [
  {
    name: 'bidfax',
    displayName: 'BidFax',
    baseUrl: 'https://bidfax.info',
    searchUrl: (vin: string) => `https://bidfax.info/search?query=${vin}`,
    detailUrl: (vin: string) => `https://bidfax.info/${vin}`,
    selectors: {
      vin: '.vin-number, .vehicle-vin',
      price: '.price, .final-bid',
      title: '.vehicle-title, h1',
      images: '.gallery img, .vehicle-images img',
      lotNumber: '.lot-number',
      saleDate: '.sale-date',
    },
    priority: 10,
    rateLimit: 2000,
    enabled: true,
  },
  {
    name: 'poctra',
    displayName: 'Poctra',
    baseUrl: 'https://poctra.com',
    searchUrl: (vin: string) => `https://poctra.com/search?q=${vin}`,
    detailUrl: (vin: string) => `https://poctra.com/vin/${vin}`,
    selectors: {
      vin: '.vin, [data-vin]',
      price: '.price, .bid-amount',
      title: '.title, h1',
      images: '.carousel img, .photos img',
    },
    priority: 11,
    rateLimit: 2000,
    enabled: true,
  },
  {
    name: 'statvin',
    displayName: 'Stat.VIN',
    baseUrl: 'https://stat.vin',
    searchUrl: (vin: string) => `https://stat.vin/cars/${vin}`,
    selectors: {
      vin: '.vin-code',
      price: '.sale-price',
      title: '.car-title',
      images: '.car-photos img',
      mileage: '.odometer',
      damageType: '.damage-type',
    },
    priority: 12,
    rateLimit: 2500,
    enabled: false, // DISABLED: HTTP 404 errors consistently
  },
  {
    name: 'autobidmaster',
    displayName: 'AutoBidMaster',
    baseUrl: 'https://autobidmaster.com',
    searchUrl: (vin: string) => `https://autobidmaster.com/en/search?q=${vin}`,
    selectors: {
      vin: '.vin',
      price: '.current-bid',
      title: '.vehicle-name',
      images: '.vehicle-gallery img',
      lotNumber: '.lot-id',
    },
    priority: 20,
    rateLimit: 3000,
    enabled: true,
  },
  {
    name: 'salvagebid',
    displayName: 'SalvageBid',
    baseUrl: 'https://salvagebid.com',
    searchUrl: (vin: string) => `https://salvagebid.com/search?vin=${vin}`,
    selectors: {
      vin: '.vin-number',
      price: '.price-value',
      title: '.vehicle-title',
      images: '.photo-gallery img',
    },
    priority: 21,
    rateLimit: 3000,
    enabled: true,
  },
  {
    name: 'iaai',
    displayName: 'IAAI',
    baseUrl: 'https://iaai.com',
    searchUrl: (vin: string) => `https://iaai.com/Search?Keyword=${vin}`,
    selectors: {
      vin: '.vin',
      price: '.high-bid',
      title: '.vehicle-make-model',
      images: '.vehicle-images img',
      lotNumber: '.stock-number',
      saleDate: '.sale-info',
    },
    priority: 5,
    rateLimit: 5000,
    enabled: true,
  },
  {
    name: 'copart',
    displayName: 'Copart',
    baseUrl: 'https://copart.com',
    searchUrl: (vin: string) => `https://copart.com/lotSearchResults/?free=true&query=${vin}`,
    selectors: {
      vin: '.lot-vin',
      price: '.bid-price',
      title: '.lot-title',
      images: '.lot-image img',
      lotNumber: '.lot-number',
      saleDate: '.sale-date',
      damageType: '.primary-damage',
    },
    priority: 5,
    rateLimit: 5000,
    enabled: false, // DISABLED: Anti-bot blocks Puppeteer, returns landing page
  },
];

/**
 * Get enabled sources sorted by priority
 */
export function getEnabledSources(): CompetitorSource[] {
  return COMPETITOR_SOURCES
    .filter(s => s.enabled)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Get source by name
 */
export function getSourceByName(name: string): CompetitorSource | undefined {
  return COMPETITOR_SOURCES.find(s => s.name === name);
}
