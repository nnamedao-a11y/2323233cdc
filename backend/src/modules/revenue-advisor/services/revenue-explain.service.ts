/**
 * Revenue Explain Service
 * 
 * Генерує людиночитабельні пояснення для рекомендацій
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RuleInput, RuleDecision } from './revenue-rules.service';

export interface Explanation {
  summary: string;
  details: string[];
  aiExplanation?: string;
  recommendation: string;
}

@Injectable()
export class RevenueExplainService {
  private readonly logger = new Logger(RevenueExplainService.name);
  private aiClient: any = null;

  constructor(private readonly configService: ConfigService) {
    this.initAI();
  }

  private async initAI() {
    try {
      const apiKey = this.configService.get('EMERGENT_API_KEY');
      if (apiKey) {
        // Dynamic import for emergentintegrations
        const module = await import('emergentintegrations' as any).catch(() => null);
        if (module?.EmergentAI) {
          this.aiClient = new module.EmergentAI({ apiKey });
        }
      }
    } catch (error) {
      this.logger.warn('[RevenueExplain] AI client not available');
    }
  }

  /**
   * Згенерувати пояснення
   */
  async explain(input: RuleInput, decision: RuleDecision): Promise<Explanation> {
    const details = this.buildDetails(input, decision);
    const summary = this.buildSummary(decision);
    const recommendation = this.buildRecommendation(decision);

    let aiExplanation;
    if (this.aiClient) {
      try {
        aiExplanation = await this.generateAIExplanation(input, decision);
      } catch (error) {
        this.logger.warn('[RevenueExplain] AI explanation failed');
      }
    }

    return {
      summary,
      details,
      aiExplanation,
      recommendation,
    };
  }

  /**
   * Побудувати деталі
   */
  private buildDetails(input: RuleInput, decision: RuleDecision): string[] {
    const details: string[] = [];

    // User behavior
    if (input.intentLevel === 'hot') {
      details.push(`🔥 Користувач HOT (intent: ${input.intentScore})`);
    } else if (input.intentLevel === 'warm') {
      details.push(`⚠️ Користувач WARM (intent: ${input.intentScore})`);
    } else {
      details.push(`❄️ Користувач COLD (intent: ${input.intentScore})`);
    }

    if (input.compareCount >= 2) {
      details.push(`⚖️ Порівнює ${input.compareCount} авто - активно вибирає`);
    }

    if (input.favoritesCount >= 3) {
      details.push(`❤️ ${input.favoritesCount} авто в обраному`);
    }

    // Margin analysis
    if (input.netProfit > 1500) {
      details.push(`💰 Висока маржа ($${input.netProfit}) - можлива знижка`);
    } else if (input.netProfit > 500) {
      details.push(`💵 Середня маржа ($${input.netProfit}) - обмежена знижка`);
    } else {
      details.push(`⚠️ Низька маржа ($${input.netProfit}) - знижка недоступна`);
    }

    // Activity
    if (input.lastActivityHours && input.lastActivityHours > 24) {
      details.push(`⏰ Неактивний ${Math.round(input.lastActivityHours)} годин - ризик втрати`);
    }

    return details;
  }

  /**
   * Побудувати summary
   */
  private buildSummary(decision: RuleDecision): string {
    const actionText = {
      close_now: '🎯 ЗАКРИВАТИ ЗАРАЗ',
      push: '📞 ДОЖИМАТИ',
      hold: '⏸️ ТРИМАТИ',
      educate: '📚 ІНФОРМУВАТИ',
    };

    let summary = actionText[decision.action];

    if (decision.discount > 0) {
      summary += ` | Знижка: $${decision.discount}`;
    }

    summary += ` | Впевненість: ${decision.confidence}%`;

    return summary;
  }

  /**
   * Побудувати рекомендацію
   */
  private buildRecommendation(decision: RuleDecision): string {
    switch (decision.action) {
      case 'close_now':
        if (decision.discount > 0) {
          return `Клієнт готовий до покупки. Запропонуйте знижку $${decision.discount} для швидкого закриття.`;
        }
        return 'Клієнт готовий до покупки. Закривайте угоду без знижки.';

      case 'push':
        if (decision.discount > 0) {
          return `Клієнт потребує дожиму. Запропонуйте знижку до $${decision.discount} як аргумент.`;
        }
        return 'Клієнт потребує дожиму. Зателефонуйте та підкресліть переваги авто.';

      case 'educate':
        return 'Клієнт збирає інформацію. Надайте детальну консультацію, відповіді на питання.';

      case 'hold':
        return 'Низький пріоритет. Не витрачайте багато часу, зосередьтесь на гарячіших клієнтах.';
    }
  }

  /**
   * AI-генерація пояснення
   */
  private async generateAIExplanation(input: RuleInput, decision: RuleDecision): Promise<string> {
    const prompt = `
Ти - експерт з продажів автомобілів. Поясни менеджеру рекомендацію.

Контекст клієнта:
- Intent score: ${input.intentScore} (${input.intentLevel})
- Порівнює авто: ${input.compareCount}
- В обраному: ${input.favoritesCount}
- Маржа: $${input.netProfit}
- Неактивний: ${input.lastActivityHours || 0} годин

Рекомендація:
- Дія: ${decision.action}
- Знижка: $${decision.discount}
- Впевненість: ${decision.confidence}%

Причини:
${decision.reasons.join('\n')}

Напиши коротке (2-3 речення) пояснення для менеджера українською. Tone: дружній, практичний.
`;

    const response = await this.aiClient.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
    });

    return response.choices?.[0]?.message?.content || '';
  }
}
