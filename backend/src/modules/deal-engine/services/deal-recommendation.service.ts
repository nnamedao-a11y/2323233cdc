/**
 * Deal Recommendation Service
 * 
 * Generates human-readable recommendations for deals
 */

import { Injectable } from '@nestjs/common';

export interface RecommendationInput {
  decision: 'strong_buy' | 'buy' | 'watch' | 'avoid';
  maxBid: number;
  breakEvenBid: number;
  finalAllInPrice: number;
  marketPrice: number;
  netProfit: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors?: string[];
}

export interface RecommendationResult {
  badge: string;
  badgeColor: string;
  message: string;
  messageUk: string;
  priceFrame: {
    marketPrice: number;
    maxBid: number;
    breakEvenBid: number;
    finalAllInPrice: number;
    netProfit: number;
    profitPercent: number;
  };
  riskLevel: string;
  riskFactors: string[];
  actionItems: string[];
  actionItemsUk: string[];
}

@Injectable()
export class DealRecommendationService {
  build(input: RecommendationInput): RecommendationResult {
    let badge = 'WATCH';
    let badgeColor = 'yellow';
    let message = 'Monitor this lot and wait for more data.';
    let messageUk = 'Спостерігайте за лотом, чекайте на більше даних.';
    let actionItems: string[] = [];
    let actionItemsUk: string[] = [];

    const profitPercent = input.marketPrice > 0
      ? Math.round((input.netProfit / input.marketPrice) * 100)
      : 0;

    switch (input.decision) {
      case 'strong_buy':
        badge = 'STRONG BUY';
        badgeColor = 'green';
        message = `Excellent deal! Net profit $${input.netProfit.toLocaleString()} (${profitPercent}%). Low risk. Proceed with confidence.`;
        messageUk = `Відмінна угода! Чистий прибуток $${input.netProfit.toLocaleString()} (${profitPercent}%). Низький ризик. Дійте впевнено.`;
        actionItems = [
          'Place bid immediately',
          'Prepare financing',
          'Schedule inspection if possible',
          'Have transport ready',
        ];
        actionItemsUk = [
          'Зробіть ставку негайно',
          'Підготуйте фінансування',
          'Заплануйте огляд, якщо можливо',
          'Підготуйте транспорт',
        ];
        break;

      case 'buy':
        badge = 'BUY';
        badgeColor = 'blue';
        message = `Good opportunity. Net profit $${input.netProfit.toLocaleString()}. Consider proceeding with standard due diligence.`;
        messageUk = `Хороша можливість. Чистий прибуток $${input.netProfit.toLocaleString()}. Рекомендуємо стандартну перевірку.`;
        actionItems = [
          'Review vehicle history',
          'Calculate exact transport costs',
          'Check market demand for this model',
          'Place bid within budget',
        ];
        actionItemsUk = [
          'Перевірте історію авто',
          'Розрахуйте точну вартість доставки',
          'Перевірте попит на цю модель',
          'Зробіть ставку в межах бюджету',
        ];
        break;

      case 'watch':
        badge = 'WATCH';
        badgeColor = 'yellow';
        message = `Marginal opportunity. Net profit $${input.netProfit.toLocaleString()}. ${input.riskLevel === 'high' ? 'High risk factors present.' : 'Monitor for price changes.'}`;
        messageUk = `Маргінальна можливість. Чистий прибуток $${input.netProfit.toLocaleString()}. ${input.riskLevel === 'high' ? 'Присутні високі фактори ризику.' : 'Слідкуйте за зміною ціни.'}`;
        actionItems = [
          'Add to watchlist',
          'Wait for price drop',
          'Gather more information',
          'Consider alternative vehicles',
        ];
        actionItemsUk = [
          'Додайте до списку спостереження',
          'Чекайте на зниження ціни',
          'Зберіть більше інформації',
          'Розгляньте альтернативні авто',
        ];
        break;

      case 'avoid':
        badge = 'AVOID';
        badgeColor = 'red';
        message = `Not recommended. ${input.netProfit <= 0 ? 'Negative profit expected.' : 'Risk too high for potential return.'}`;
        messageUk = `Не рекомендується. ${input.netProfit <= 0 ? 'Очікується негативний прибуток.' : 'Ризик занадто високий для потенційного прибутку.'}`;
        actionItems = [
          'Skip this vehicle',
          'Look for alternatives',
          'Document why passed for learning',
        ];
        actionItemsUk = [
          'Пропустіть це авто',
          'Шукайте альтернативи',
          'Запишіть причину відмови для навчання',
        ];
        break;
    }

    return {
      badge,
      badgeColor,
      message,
      messageUk,
      priceFrame: {
        marketPrice: input.marketPrice,
        maxBid: input.maxBid,
        breakEvenBid: input.breakEvenBid,
        finalAllInPrice: input.finalAllInPrice,
        netProfit: input.netProfit,
        profitPercent,
      },
      riskLevel: input.riskLevel,
      riskFactors: input.riskFactors || [],
      actionItems,
      actionItemsUk,
    };
  }
}
