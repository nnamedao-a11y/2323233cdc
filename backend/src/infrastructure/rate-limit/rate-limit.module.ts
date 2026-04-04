/**
 * Rate Limiting Module
 * 
 * Provides intelligent rate limiting per role:
 * - Owner: 1000 req/min (analytics, exports)
 * - Team Lead: 500 req/min (team management)
 * - Manager: 300 req/min (daily operations)
 * - Customer: 100 req/min (cabinet access)
 * - Public: 60 req/min (unauthenticated)
 * 
 * Features:
 * - Per-IP rate limiting for unauthenticated requests
 * - Per-User rate limiting for authenticated requests
 * - Sliding window algorithm
 * - Graceful degradation
 */

import { Module, Global, Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

// Rate limits by role
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  owner: { windowMs: 60000, maxRequests: 1000 },      // 1000/min
  team_lead: { windowMs: 60000, maxRequests: 500 },   // 500/min
  manager: { windowMs: 60000, maxRequests: 300 },     // 300/min
  customer: { windowMs: 60000, maxRequests: 100 },    // 100/min
  public: { windowMs: 60000, maxRequests: 60 },       // 60/min
};

// Stricter limits for sensitive endpoints
const STRICT_LIMITS: Record<string, RateLimitConfig> = {
  '/api/auth/login': { windowMs: 60000, maxRequests: 10 },       // 10/min
  '/api/auth/register': { windowMs: 60000, maxRequests: 5 },     // 5/min
  '/api/auth/refresh': { windowMs: 60000, maxRequests: 30 },     // 30/min
  '/api/payments': { windowMs: 60000, maxRequests: 20 },         // 20/min
};

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly store = new Map<string, RateLimitEntry>();
  
  // Cleanup interval
  constructor() {
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be rate limited
   * Returns remaining requests or throws if limited
   */
  checkLimit(key: string, config: RateLimitConfig): { remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      this.store.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return { remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
    }

    if (entry.count >= config.maxRequests) {
      // Rate limited
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    entry.count++;
    return { remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
  }

  /**
   * Get rate limit config for a request
   */
  getConfig(path: string, role?: string): RateLimitConfig {
    // Check strict limits first
    for (const [pattern, config] of Object.entries(STRICT_LIMITS)) {
      if (path.startsWith(pattern)) {
        return config;
      }
    }

    // Return role-based limit
    return RATE_LIMITS[role || 'public'] || RATE_LIMITS.public;
  }

  /**
   * Generate rate limit key
   */
  generateKey(ip: string, userId?: string, path?: string): string {
    if (userId) {
      return `user:${userId}`;
    }
    // For unauthenticated, use IP + path prefix
    const pathPrefix = path?.split('/').slice(0, 4).join('/') || 'default';
    return `ip:${ip}:${pathPrefix}`;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  /**
   * Get current stats
   */
  getStats(): { totalEntries: number; activeUsers: number } {
    const now = Date.now();
    let activeUsers = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (key.startsWith('user:') && now <= entry.resetAt) {
        activeUsers++;
      }
    }
    
    return {
      totalEntries: this.store.size,
      activeUsers,
    };
  }
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(private readonly rateLimitService: RateLimitService) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Extract user info from JWT if present
      const authHeader = req.headers.authorization;
      let userId: string | undefined;
      let userRole: string | undefined;

      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          userId = payload.sub;
          userRole = payload.role;
        } catch {
          // Invalid token, treat as public
        }
      }

      // Get client IP
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      
      // Get rate limit config
      const config = this.rateLimitService.getConfig(req.path, userRole);
      
      // Generate key
      const key = this.rateLimitService.generateKey(ip, userId, req.path);
      
      // Check limit
      const { remaining, resetAt } = this.rateLimitService.checkLimit(key, config);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));
      
      next();
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse() as any;
        res.setHeader('Retry-After', response.retryAfter || 60);
        res.status(error.getStatus()).json(response);
      } else {
        // Don't block on rate limit errors
        this.logger.warn(`Rate limit check failed: ${error.message}`);
        next();
      }
    }
  }
}

// Export service token
export const RATE_LIMIT_SERVICE = 'RATE_LIMIT_SERVICE';

@Global()
@Module({
  providers: [
    RateLimitService,
    RateLimitMiddleware,
    {
      provide: RATE_LIMIT_SERVICE,
      useExisting: RateLimitService,
    },
  ],
  exports: [RateLimitService, RateLimitMiddleware, RATE_LIMIT_SERVICE],
})
export class RateLimitModule {}
