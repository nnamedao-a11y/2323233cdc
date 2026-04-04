/**
 * Manager AI Service
 * 
 * AI-powered recommendations for sales managers:
 * - What action to take (close_now / follow_up / educate)
 * - What to say to the customer
 * - Price strategy suggestions
 * - Urgency level
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ManagerAIInput {
  user: {
    id: string;
    intent: string; // hot/warm/cold
    score: number;
    name?: string;
    email?: string;
    phone?: string;
  };
  behavior: {
    favorites: string[];
    compare: string[];
    lastViewedVin?: string;
    lastAction?: string;
    favoritesCount: number;
    comparesCount: number;
    historyRequestsCount: number;
  };
  vehicleContext?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
    marketPrice?: number;
    maxBid?: number;
    finalPrice?: number;
    dealScore?: number;
  };
  crm?: {
    previousContacts?: number;
    leadStatus?: string;
    lastContactAt?: string;
  };
}

export interface ManagerAIOutput {
  action: 'close_now' | 'follow_up' | 'educate' | 'nurture';
  message: string;
  messageUk: string;
  offer?: {
    priceSuggestion?: number;
    discount?: number;
    urgencyReason?: string;
  };
  urgency: 'low' | 'medium' | 'high' | 'critical';
  strategy: string;
  strategyUk: string;
  nextSteps: string[];
  confidence: number;
}

@Injectable()
export class ManagerAIService {
  private readonly logger = new Logger(ManagerAIService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate AI advice for a lead/user
   */
  async generateAdvice(input: ManagerAIInput): Promise<ManagerAIOutput> {
    this.logger.log(`[ManagerAI] Generating advice for user ${input.user.id}, intent: ${input.user.intent}`);

    // Try AI generation, fallback to rule-based
    try {
      const aiResponse = await this.callAI(input);
      if (aiResponse) {
        return aiResponse;
      }
    } catch (error) {
      this.logger.warn(`[ManagerAI] AI call failed, using rule-based fallback: ${error.message}`);
    }

    // Rule-based fallback
    return this.generateRuleBasedAdvice(input);
  }

  /**
   * Call external AI API (OpenAI compatible)
   */
  private async callAI(input: ManagerAIInput): Promise<ManagerAIOutput | null> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') || 
                   this.configService.get<string>('EMERGENT_API_KEY');
    
    if (!apiKey) {
      return null;
    }

    const prompt = this.buildPrompt(input);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an expert car sales advisor. Respond only in valid JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const json = await response.json();
      const text = json.choices?.[0]?.message?.content;

      if (text) {
        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (error) {
      this.logger.error(`[ManagerAI] AI call error: ${error.message}`);
    }

    return null;
  }

  /**
   * Build prompt for AI
   */
  private buildPrompt(input: ManagerAIInput): string {
    return `
You are a car sales expert helping a manager close a deal.

USER PROFILE:
- Intent Level: ${input.user.intent.toUpperCase()}
- Intent Score: ${input.user.score}
- Name: ${input.user.name || 'Unknown'}
- Contact: ${input.user.email || input.user.phone || 'No contact'}

BEHAVIOR:
- Favorites count: ${input.behavior.favoritesCount}
- Compares count: ${input.behavior.comparesCount}
- History requests: ${input.behavior.historyRequestsCount}
- Last viewed VIN: ${input.behavior.lastViewedVin || 'N/A'}
- Favorite VINs: ${input.behavior.favorites?.slice(0, 3).join(', ') || 'None'}
- Compare VINs: ${input.behavior.compare?.slice(0, 3).join(', ') || 'None'}

${input.vehicleContext ? `
VEHICLE CONTEXT:
- VIN: ${input.vehicleContext.vin || 'N/A'}
- Make/Model: ${input.vehicleContext.make || ''} ${input.vehicleContext.model || ''} ${input.vehicleContext.year || ''}
- Market Price: $${input.vehicleContext.marketPrice || 'N/A'}
- Max Bid: $${input.vehicleContext.maxBid || 'N/A'}
- Final Price: $${input.vehicleContext.finalPrice || 'N/A'}
` : ''}

${input.crm ? `
CRM STATUS:
- Lead Status: ${input.crm.leadStatus || 'new'}
- Previous Contacts: ${input.crm.previousContacts || 0}
- Last Contact: ${input.crm.lastContactAt || 'Never'}
` : ''}

TASK: Analyze this customer and provide sales strategy.

Respond in this exact JSON format:
{
  "action": "close_now" | "follow_up" | "educate" | "nurture",
  "message": "Short message to say to customer in English",
  "messageUk": "Same message in Ukrainian",
  "offer": {
    "priceSuggestion": number or null,
    "discount": number or null,
    "urgencyReason": "Why act now" or null
  },
  "urgency": "low" | "medium" | "high" | "critical",
  "strategy": "Brief strategy explanation in English",
  "strategyUk": "Strategy in Ukrainian",
  "nextSteps": ["Step 1", "Step 2", "Step 3"],
  "confidence": 0.0 to 1.0
}
`;
  }

  /**
   * Rule-based fallback when AI is unavailable
   */
  private generateRuleBasedAdvice(input: ManagerAIInput): ManagerAIOutput {
    const { user, behavior, vehicleContext } = input;
    
    // Determine action based on intent
    let action: ManagerAIOutput['action'] = 'nurture';
    let urgency: ManagerAIOutput['urgency'] = 'low';
    let message = '';
    let messageUk = '';
    let strategy = '';
    let strategyUk = '';
    let nextSteps: string[] = [];
    let confidence = 0.6;

    if (user.intent === 'hot') {
      // HOT USER - close immediately
      action = 'close_now';
      urgency = 'critical';
      confidence = 0.85;

      if (behavior.comparesCount > 0) {
        message = `You've been comparing vehicles - I can help you make the best decision. Let's discuss your top choice.`;
        messageUk = `Ви порівнювали автомобілі - я можу допомогти зробити найкращий вибір. Давайте обговоримо ваш топ-вибір.`;
        strategy = `User is comparing - ready to buy. Focus on differentiating value.`;
        strategyUk = `Користувач порівнює - готовий купувати. Сфокусуйтесь на цінності.`;
      } else if (behavior.favoritesCount > 0) {
        message = `I noticed you've saved some vehicles. Would you like me to check availability and get you the best price?`;
        messageUk = `Я помітив, що ви зберегли деякі авто. Хочете, я перевірю наявність і знайду найкращу ціну?`;
        strategy = `User has favorites - show commitment, offer exclusive deal.`;
        strategyUk = `Користувач має обране - покажіть залученість, запропонуйте ексклюзивну угоду.`;
      } else {
        message = `You seem very interested in finding the right vehicle. Let me help you navigate our options.`;
        messageUk = `Схоже, ви дуже зацікавлені знайти правильне авто. Дозвольте допомогти з вибором.`;
        strategy = `High engagement but unclear preference. Discover needs quickly.`;
        strategyUk = `Висока залученість, але незрозумілі вподобання. Швидко з'ясуйте потреби.`;
      }

      nextSteps = [
        'Call within 15 minutes',
        'Prepare comparison sheet',
        'Have financing options ready',
        'Know current inventory availability',
      ];

    } else if (user.intent === 'warm') {
      // WARM USER - follow up
      action = 'follow_up';
      urgency = 'medium';
      confidence = 0.7;

      message = `Hi! I see you've been browsing our inventory. Any questions I can help answer?`;
      messageUk = `Привіт! Я бачу, що ви переглядали наш каталог. Чи є питання, на які я можу відповісти?`;
      strategy = `User is interested but not committed. Build relationship, understand timeline.`;
      strategyUk = `Користувач зацікавлений, але не готовий. Побудуйте стосунки, зрозумійте терміни.`;

      nextSteps = [
        'Send follow-up message within 2 hours',
        'Share relevant vehicle info',
        'Ask about timeline and budget',
      ];

    } else {
      // COLD USER - educate/nurture
      action = 'educate';
      urgency = 'low';
      confidence = 0.5;

      message = `Welcome! Let me know if you need help finding the perfect vehicle or have any questions.`;
      messageUk = `Ласкаво просимо! Дайте знати, якщо потрібна допомога у пошуку ідеального авто.`;
      strategy = `User is exploring. Provide value, don't pressure.`;
      strategyUk = `Користувач досліджує. Дайте цінність, не тисніть.`;

      nextSteps = [
        'Add to nurture email sequence',
        'Send weekly highlights',
        'Monitor for increased activity',
      ];
    }

    // Add price suggestion if we have vehicle context
    let offer: ManagerAIOutput['offer'] = undefined;
    if (vehicleContext?.marketPrice && user.intent === 'hot') {
      offer = {
        priceSuggestion: Math.round(vehicleContext.marketPrice * 0.97), // 3% discount
        discount: Math.round(vehicleContext.marketPrice * 0.03),
        urgencyReason: 'Limited time offer for serious buyers',
      };
    }

    return {
      action,
      message,
      messageUk,
      offer,
      urgency,
      strategy,
      strategyUk,
      nextSteps,
      confidence,
    };
  }
}
