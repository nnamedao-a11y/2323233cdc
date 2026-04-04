/**
 * VIN Source Adapter Interface
 * 
 * Єдиний контракт для всіх типів адаптерів парсингу
 */

export interface SearchResult {
  url: string;
  html?: string;
  json?: any;
  title?: string;
  snippet?: string;
  source: string;
}

export interface NormalizedVehicle {
  vin: string;
  lotNumber?: string | null;
  title?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  price?: number | null;
  saleDate?: Date | null;
  location?: string | null;
  mileage?: number | null;
  damage?: string | null;
  damageSecondary?: string | null;
  driveType?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  engineSize?: string | null;
  color?: string | null;
  keys?: boolean;
  source: string;
  sourceUrl: string;
  images: string[];
  isAuction: boolean;
  confidence: number;
  extractedAt: Date;
  rawMeta?: Record<string, any>;
}

export interface HealthResult {
  healthy: boolean;
  latency: number;
  message?: string;
  checkedAt: Date;
}

export interface SourceValidationResult {
  valid: boolean;
  hitRate: number;
  avgCompleteness: number;
  avgLatency: number;
  testedVins: number;
  successfulVins: number;
  errors: string[];
}

export interface SourceConfig {
  id: string;
  name: string;
  domain: string;
  parserKind: 'google' | 'search_form' | 'html' | 'json' | 'rss' | 'nhtsa';
  type: 'auction' | 'aggregator' | 'competitor' | 'classified' | 'fallback';
  enabled: boolean;
  priority: number;
  trustScore: number;
  vinHitRate: number;
  dataCompleteness: number;
  freshnessScore: number;
  avgLatency: number;
  
  // Конфігурація запитів
  requestConfig: {
    searchUrl?: string;
    detailUrl?: string;
    method?: string;
    headers?: Record<string, string>;
    timeout?: number;
    rateLimit?: number;
  };
  
  // Конфігурація селекторів
  selectorConfig: {
    vin?: string;
    title?: string;
    price?: string;
    saleDate?: string;
    lotNumber?: string;
    mileage?: string;
    damage?: string;
    location?: string;
    images?: string;
    make?: string;
    model?: string;
    year?: string;
    resultContainer?: string;
    nextPage?: string;
  };
  
  // Тестові VIN коди
  sampleVins: string[];
  
  // Статус
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  cooldownUntil?: Date;
  quarantine: boolean;
  quarantineReason?: string;
  
  // Lifecycle
  status: 'draft' | 'testing' | 'active' | 'degraded' | 'disabled' | 'quarantined';
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface VinSourceAdapter {
  readonly kind: string;
  readonly displayName: string;
  
  /**
   * Пошук VIN через джерело
   * Повертає список результатів для подальшої екстракції
   */
  search?(vin: string, source: SourceConfig): Promise<SearchResult[]>;
  
  /**
   * Екстракція даних з результату пошуку
   */
  extract(input: SearchResult, source: SourceConfig): Promise<NormalizedVehicle | null>;
  
  /**
   * Перевірка здоров'я джерела
   */
  healthCheck(source: SourceConfig): Promise<HealthResult>;
  
  /**
   * Валідація джерела на тестових VIN
   */
  validate?(source: SourceConfig): Promise<SourceValidationResult>;
  
  /**
   * Чи може адаптер обробити це джерело
   */
  canHandle(source: SourceConfig): boolean;
}
