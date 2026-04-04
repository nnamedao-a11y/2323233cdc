import { Injectable } from '@nestjs/common';
import { LeadScore, LeadSignals } from './predictive-score.service';

export type NextAction = 
  | 'call_now'
  | 'callback_priority'
  | 'send_sms'
  | 'follow_up_today'
  | 'follow_up_tomorrow'
  | 'nurture'
  | 'close_now';

export interface ActionRecommendation {
  action: NextAction;
  actionUk: string;
  priority: number; // 1 = highest
  reason: string;
  reasonUk: string;
  script?: string;
  scriptUk?: string;
}

@Injectable()
export class PredictiveActionService {
  
  getAction(score: LeadScore, signals: LeadSignals): ActionRecommendation {
    // === HOT + NOT CONTACTED = CALL NOW ===
    if (score.bucket === 'hot' && !signals.wasContacted) {
      return {
        action: 'call_now',
        actionUk: 'Зателефонувати ЗАРАЗ',
        priority: 1,
        reason: 'Hot lead not yet contacted - highest priority',
        reasonUk: 'Гарячий лід не контактовано - найвищий пріоритет',
        script: 'I see you are interested in this car. I can help you get the best price.',
        scriptUk: 'Бачу ви зацікавлені в цьому авто. Допоможу отримати найкращу ціну.',
      };
    }

    // === HOT + CALLBACK REQUESTED ===
    if (score.bucket === 'hot' && signals.requestedCallback) {
      return {
        action: 'callback_priority',
        actionUk: 'Пріоритетний callback',
        priority: 1,
        reason: 'Hot lead requested callback',
        reasonUk: 'Гарячий лід просив передзвонити',
        script: 'Calling as you requested. Ready to discuss the car?',
        scriptUk: 'Дзвоню як ви просили. Готові обговорити авто?',
      };
    }

    // === HOT + NEGOTIATION = CLOSE NOW ===
    if (score.bucket === 'hot' && signals.negotiation) {
      return {
        action: 'close_now',
        actionUk: 'Закривати ЗАРАЗ',
        priority: 1,
        reason: 'Hot lead in negotiation - push for close',
        reasonUk: 'Гарячий лід на переговорах - тиснути на закриття',
        script: 'What will it take to close this deal today?',
        scriptUk: 'Що потрібно щоб закрити угоду сьогодні?',
      };
    }

    // === WARM + NO ANSWER >= 2 = SMS ===
    if (score.bucket === 'warm' && signals.noAnswerAttempts && signals.noAnswerAttempts >= 2) {
      return {
        action: 'send_sms',
        actionUk: 'Надіслати SMS',
        priority: 2,
        reason: 'Warm lead - multiple no answers, try SMS',
        reasonUk: 'Теплий лід - не відповідає, спробувати SMS',
        script: 'We tried to reach you about the car. When is a good time to call?',
        scriptUk: 'Намагались зв\'язатись щодо авто. Коли зручно поговорити?',
      };
    }

    // === WARM = FOLLOW UP TODAY ===
    if (score.bucket === 'warm') {
      return {
        action: 'follow_up_today',
        actionUk: 'Зв\'язатись сьогодні',
        priority: 2,
        reason: 'Warm lead - should be contacted today',
        reasonUk: 'Теплий лід - потрібно зв\'язатись сьогодні',
      };
    }

    // === COLD + SOME ACTIVITY ===
    if (score.bucket === 'cold' && score.breakdown.behavior > 0) {
      return {
        action: 'follow_up_tomorrow',
        actionUk: 'Зв\'язатись завтра',
        priority: 3,
        reason: 'Cold lead with some activity - follow up tomorrow',
        reasonUk: 'Холодний лід з активністю - зв\'язатись завтра',
      };
    }

    // === DEFAULT = NURTURE ===
    return {
      action: 'nurture',
      actionUk: 'Nurture кампанія',
      priority: 4,
      reason: 'Cold lead - add to nurture campaign',
      reasonUk: 'Холодний лід - додати до nurture кампанії',
    };
  }
}
