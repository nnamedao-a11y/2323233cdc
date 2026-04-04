import { Injectable, Logger } from '@nestjs/common';

/**
 * Cooldown Service
 * 
 * Prevents notification spam by enforcing minimum intervals
 * between notifications of the same type to the same user
 */

interface CooldownEntry {
  lastSent: number;
  count: number;
}

@Injectable()
export class CooldownService {
  private readonly logger = new Logger(CooldownService.name);
  
  // In-memory cooldown store (use Redis in production for scaling)
  private cooldowns = new Map<string, CooldownEntry>();

  // Default cooldown times in milliseconds
  private readonly DEFAULT_COOLDOWNS: Record<string, number> = {
    auction_soon: 2 * 60 * 60 * 1000,      // 2 hours
    price_drop: 4 * 60 * 60 * 1000,        // 4 hours
    recommendation: 24 * 60 * 60 * 1000,   // 24 hours
    new_lead: 5 * 60 * 1000,               // 5 minutes
    deal_status_changed: 30 * 60 * 1000,   // 30 minutes
    waiting_deposit_timeout: 6 * 60 * 60 * 1000, // 6 hours
    default: 1 * 60 * 60 * 1000,           // 1 hour default
  };

  /**
   * Check if notification can be sent (cooldown passed)
   */
  check(userId: string, type: string): boolean {
    const key = this.getKey(userId, type);
    const entry = this.cooldowns.get(key);

    if (!entry) {
      return true;
    }

    const cooldownTime = this.DEFAULT_COOLDOWNS[type] || this.DEFAULT_COOLDOWNS.default;
    const elapsed = Date.now() - entry.lastSent;

    return elapsed >= cooldownTime;
  }

  /**
   * Record that a notification was sent
   */
  record(userId: string, type: string): void {
    const key = this.getKey(userId, type);
    const entry = this.cooldowns.get(key);

    this.cooldowns.set(key, {
      lastSent: Date.now(),
      count: (entry?.count || 0) + 1,
    });
  }

  /**
   * Reset cooldown for a user/type
   */
  reset(userId: string, type: string): void {
    const key = this.getKey(userId, type);
    this.cooldowns.delete(key);
  }

  /**
   * Get remaining cooldown time in ms
   */
  getRemainingCooldown(userId: string, type: string): number {
    const key = this.getKey(userId, type);
    const entry = this.cooldowns.get(key);

    if (!entry) return 0;

    const cooldownTime = this.DEFAULT_COOLDOWNS[type] || this.DEFAULT_COOLDOWNS.default;
    const elapsed = Date.now() - entry.lastSent;
    const remaining = cooldownTime - elapsed;

    return Math.max(0, remaining);
  }

  /**
   * Check if within sending hours (9:00 - 21:00)
   */
  isGoodSendTime(): boolean {
    const hour = new Date().getHours();
    return hour >= 9 && hour <= 21;
  }

  /**
   * Get best send time suggestion
   */
  getBestSendTime(): { start: number; end: number } {
    // Peak engagement times
    return {
      start: 10, // 10:00
      end: 20,   // 20:00
    };
  }

  private getKey(userId: string, type: string): string {
    return `${userId}_${type}`;
  }

  /**
   * Clean up old entries (call periodically)
   */
  cleanup(): void {
    const maxAge = 48 * 60 * 60 * 1000; // 48 hours
    const now = Date.now();

    for (const [key, entry] of this.cooldowns.entries()) {
      if (now - entry.lastSent > maxAge) {
        this.cooldowns.delete(key);
      }
    }
  }
}
