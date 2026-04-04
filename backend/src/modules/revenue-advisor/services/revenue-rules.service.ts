/**
 * Revenue Rules Service
 * 
 * Rule-based логіка для рекомендацій:
 * - HOT user → close_now
 * - User сравнює → більше уваги
 * - Inactive → push
 * - Margin allows discount → можлива знижка
 */

import { Injectable, Logger } from '@nestjs/common';

export interface RuleInput {
  intentScore: number;
  intentLevel: string;
  compareCount: number;
  favoritesCount: number;
  lastActivityHours?: number;
  marketPrice: number;
  finalPrice: number;
  netProfit: number;
  maxBid?: number;
}

export interface RuleDecision {
  action: 'close_now' | 'push' | 'hold' | 'educate';
  discount: number;
  confidence: number;
  maxAllowedDiscount: number;
  reasons: string[];
}

@Injectable()
export class RevenueRulesService {
  private readonly logger = new Logger(RevenueRulesService.name);

  /**
   * Оцінка по правилах
   */
  evaluate(input: RuleInput): RuleDecision {
    const reasons: string[] = [];
    let action: RuleDecision['action'] = 'hold';
    let discount = 0;
    let confidence = 0;

    // Максимальна допустима знижка (30% від profit)
    const maxAllowedDiscount = Math.floor(input.netProfit * 0.3);

    // 🔥 1. HOT user - готовий купувати
    if (input.intentScore >= 10 || input.intentLevel === 'hot') {
      action = 'close_now';
      confidence += 30;
      reasons.push('Користувач HOT (високий намір покупки)');
    }

    // 🔥 2. User порівнює 2+ авто - активно вибирає
    if (input.compareCount >= 2) {
      confidence += 20;
      reasons.push(`Порівнює ${input.compareCount} авто (активний вибір)`);
      if (action === 'hold') action = 'push';
    }

    // 🔥 3. Багато favorites - серйозний інтерес
    if (input.favoritesCount >= 3) {
      confidence += 15;
      reasons.push(`${input.favoritesCount} авто в обраному (серйозний інтерес)`);
    }

    // 🔥 4. Inactive user - ризик втрати
    if (input.lastActivityHours && input.lastActivityHours > 24) {
      reasons.push('Неактивний 24+ годин (ризик втрати)');
      if (action === 'hold') action = 'push';
      confidence += 10;
    }

    // 🔥 5. High margin - можна дати знижку
    if (input.netProfit > 1500) {
      discount = Math.min(300, maxAllowedDiscount);
      confidence += 15;
      reasons.push('Маржа дозволяє знижку до $300');
    } else if (input.netProfit > 1000) {
      discount = Math.min(200, maxAllowedDiscount);
      confidence += 10;
      reasons.push('Маржа дозволяє знижку до $200');
    } else if (input.netProfit > 500) {
      discount = Math.min(100, maxAllowedDiscount);
      confidence += 5;
      reasons.push('Маржа обмежена, знижка до $100');
    }

    // 🔥 6. Low margin - не давати знижку
    if (input.netProfit < 500) {
      discount = 0;
      if (action === 'close_now') action = 'push';
      reasons.push('⚠️ Низька маржа - знижка недоступна');
    }

    // 🔥 7. WARM user - потребує пояснень
    if (input.intentLevel === 'warm' && action === 'hold') {
      action = 'educate';
      reasons.push('WARM user - потребує додаткової інформації');
    }

    // 🔥 8. COLD user - не витрачати ресурси
    if (input.intentLevel === 'cold' && input.intentScore < 3) {
      action = 'hold';
      discount = 0;
      confidence = Math.max(confidence - 20, 10);
      reasons.push('COLD user - низький пріоритет');
    }

    // Нормалізація confidence (0-100)
    confidence = Math.min(100, Math.max(0, confidence));

    return {
      action,
      discount,
      confidence,
      maxAllowedDiscount,
      reasons,
    };
  }

  /**
   * Визначити bucket для патернів
   */
  getBuckets(input: RuleInput): {
    intentBucket: string;
    compareBucket: string;
    profitBucket: string;
  } {
    return {
      intentBucket: input.intentScore >= 10 ? 'hot' : input.intentScore >= 5 ? 'warm' : 'cold',
      compareBucket: input.compareCount >= 2 ? 'compare' : 'single',
      profitBucket: input.netProfit > 1500 ? 'high' : input.netProfit > 500 ? 'medium' : 'low',
    };
  }
}
