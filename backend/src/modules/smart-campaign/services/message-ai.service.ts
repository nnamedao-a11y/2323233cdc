/**
 * Message AI Service
 * 
 * Генерує персоналізовані повідомлення за допомогою AI:
 * - Аналіз поведінки користувача
 * - Контекст (VIN, intent, favorites)
 * - Urgency якщо потрібно
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudienceUser } from './audience.service';

export interface MessageContext {
  user: AudienceUser;
  vin?: string;
  trigger?: string;
  vehicleInfo?: {
    make?: string;
    model?: string;
    year?: number;
    price?: number;
  };
  auctionDate?: Date;
  priceChange?: number;
}

export interface GeneratedMessage {
  text: string;
  aiGenerated: boolean;
  prompt?: string;
  fallbackUsed: boolean;
}

@Injectable()
export class MessageAIService {
  private readonly logger = new Logger(MessageAIService.name);
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
          this.logger.log('[MessageAI] AI client initialized');
        }
      }
    } catch (error) {
      this.logger.warn('[MessageAI] AI client not available, using templates');
    }
  }

  /**
   * Генерувати персоналізоване повідомлення
   */
  async generate(context: MessageContext): Promise<GeneratedMessage> {
    // Спробувати AI генерацію
    if (this.aiClient) {
      try {
        return await this.generateWithAI(context);
      } catch (error) {
        this.logger.warn('[MessageAI] AI generation failed, using fallback');
      }
    }

    // Fallback на шаблони
    return this.generateFromTemplate(context);
  }

  /**
   * AI-генерація повідомлення
   */
  private async generateWithAI(context: MessageContext): Promise<GeneratedMessage> {
    const prompt = this.buildPrompt(context);

    const response = await this.aiClient.chat({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Ти - асистент продажів автомобілів BIBI Cars. 
Пиши короткі, персоналізовані повідомлення українською мовою.
Максимум 2-3 речення. Без емоджі (крім 🔥 для терміновості).
Tone: дружній, але професійний.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 150,
    });

    const text = response.choices?.[0]?.message?.content || '';

    return {
      text: text.trim(),
      aiGenerated: true,
      prompt,
      fallbackUsed: false,
    };
  }

  /**
   * Побудувати промпт для AI
   */
  private buildPrompt(context: MessageContext): string {
    const { user, vin, trigger, vehicleInfo, auctionDate, priceChange } = context;

    let prompt = `Напиши коротке SMS повідомлення для клієнта.

Контекст клієнта:
- Ім'я: ${user.name || 'Клієнт'}
- Intent score: ${user.intentScore} (${user.intentLevel})
- Обрані авто: ${user.favoritesCount}
- Порівнює: ${user.comparesCount}
`;

    if (vin) {
      prompt += `\nVIN: ${vin}`;
    }

    if (vehicleInfo) {
      prompt += `\nАвто: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`;
      if (vehicleInfo.price) {
        prompt += ` ($${vehicleInfo.price})`;
      }
    }

    switch (trigger) {
      case 'auction_soon':
        const hoursLeft = auctionDate 
          ? Math.round((auctionDate.getTime() - Date.now()) / (60 * 60 * 1000))
          : 12;
        prompt += `\n\nТригер: АУКЦІОН через ${hoursLeft} годин! Створи терміновість.`;
        break;

      case 'price_drop':
        prompt += `\n\nТригер: Ціна знизилась на $${priceChange || 500}. Підкресли вигоду.`;
        break;

      case 'inactive':
        prompt += `\n\nТригер: Користувач неактивний 48+ годин. М'яко нагадай про авто.`;
        break;

      case 'hot_user':
        prompt += `\n\nТригер: HOT користувач! Готовий купити. Запропонуй зв'язок з менеджером.`;
        break;

      default:
        prompt += `\n\nТригер: Загальне нагадування про обране авто.`;
    }

    prompt += `\n\nВимоги:
- Максимум 160 символів (SMS)
- Без привітань типу "Доброго дня"
- Call-to-action в кінці`;

    return prompt;
  }

  /**
   * Fallback генерація з шаблонів
   */
  private generateFromTemplate(context: MessageContext): GeneratedMessage {
    const { user, vin, trigger } = context;
    const name = user.name || 'Клієнт';
    const shortVin = vin ? vin.slice(-6) : '';

    const templates: Record<string, string[]> = {
      auction_soon: [
        `🔥 ${name}, авто ${shortVin} йде на аукціон через 12 годин! Встигніть зробити ставку.`,
        `Терміново! Аукціон на авто ${shortVin} вже скоро. Зателефонуйте нам: +380...`,
      ],
      price_drop: [
        `${name}, ціна на авто ${shortVin} знизилась! Перегляньте оновлену пропозицію.`,
        `Вигідна пропозиція! Авто ${shortVin} тепер дешевше. Деталі: +380...`,
      ],
      inactive: [
        `${name}, ви дивились авто ${shortVin}. Воно ще доступне! Чи актуально?`,
        `Нагадуємо про авто ${shortVin}. Маєте питання? Ми на зв'язку.`,
      ],
      hot_user: [
        `${name}, бачимо ваш інтерес! Готові допомогти з покупкою. Зателефонуйте: +380...`,
        `Дякуємо за інтерес! Менеджер готовий відповісти на ваші питання.`,
      ],
      default: [
        `${name}, перегляньте нові пропозиції на авто. Вигідні умови!`,
        `Нові авто вже доступні! Перегляньте на сайті.`,
      ],
    };

    const triggerTemplates = templates[trigger || 'default'] || templates.default;
    const template = triggerTemplates[Math.floor(Math.random() * triggerTemplates.length)];

    return {
      text: template,
      aiGenerated: false,
      fallbackUsed: true,
    };
  }

  /**
   * Валідація повідомлення (довжина, контент)
   */
  validateMessage(text: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (text.length > 160) {
      issues.push('Message too long for SMS (>160 chars)');
    }

    if (text.length < 20) {
      issues.push('Message too short');
    }

    // Перевірка на заборонені слова
    const forbidden = ['spam', 'free money', 'winner'];
    for (const word of forbidden) {
      if (text.toLowerCase().includes(word)) {
        issues.push(`Contains forbidden word: ${word}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
