import { Injectable } from '@nestjs/common';
import { CoachingIssue } from './coaching-detector.service';

export interface CoachingAdvice {
  title: string;
  titleUk: string;
  action: string;
  actionUk: string;
  script?: string;
  scriptUk?: string;
  impact: string;
  impactUk: string;
  priority: number;
}

@Injectable()
export class CoachingAdviceService {
  
  build(issue: CoachingIssue): CoachingAdvice | null {
    switch (issue.type) {
      case 'HOT_LEAD_MISSED':
        return {
          title: 'Hot Leads Missed',
          titleUk: 'Втрачені гарячі ліди',
          action: 'Call within 5 minutes of lead creation',
          actionUk: 'Зателефонувати протягом 5 хв після створення ліда',
          script: 'Say: "I see you were looking at this car, let me quickly calculate your savings"',
          scriptUk: 'Скажіть: "Бачу ви дивились авто, давайте швидко порахуємо вигоду"',
          impact: 'Losing up to 30% of potential deals',
          impactUk: 'Втрата до 30% потенційних угод',
          priority: 1,
        };

      case 'LOW_CALL_ACTIVITY':
        return {
          title: 'Not Enough Calls',
          titleUk: 'Недостатньо дзвінків',
          action: 'Call each new lead immediately, dont wait for them to respond',
          actionUk: 'Телефонуйте кожному новому ліду одразу, не чекайте відповіді',
          script: 'Proactive calling converts 3x better than waiting',
          scriptUk: 'Проактивні дзвінки конвертують в 3 рази краще',
          impact: 'Low call volume directly reduces conversion',
          impactUk: 'Низька активність дзвінків знижує конверсію',
          priority: 2,
        };

      case 'LOW_CONVERSION':
      case 'VERY_LOW_CONVERSION':
        return {
          title: 'Low Conversion Rate',
          titleUk: 'Низька конверсія',
          action: 'Use pressure and urgency tactics',
          actionUk: 'Використовуйте тактику тиску та терміновості',
          script: 'Say: "This lot will be gone soon, we can lock it in now"',
          scriptUk: 'Скажіть: "Цей лот скоро піде, можемо зафіксувати зараз"',
          impact: 'Leads are not progressing to deals',
          impactUk: 'Ліди не переходять в угоди',
          priority: issue.type === 'VERY_LOW_CONVERSION' ? 1 : 2,
        };

      case 'TASKS_OVERDUE':
        return {
          title: 'Overdue Tasks',
          titleUk: 'Прострочені задачі',
          action: 'Complete or reschedule overdue tasks today',
          actionUk: 'Завершіть або перенесіть прострочені задачі сьогодні',
          impact: 'Overdue tasks mean missed opportunities',
          impactUk: 'Прострочені задачі = втрачені можливості',
          priority: 2,
        };

      case 'LOW_CONTACT_RATE':
        return {
          title: 'Low Contact Rate',
          titleUk: 'Низький рівень контакту',
          action: 'Increase call attempts, try different times',
          actionUk: 'Збільшіть кількість спроб, пробуйте різний час',
          script: 'Best times: 10-12 AM, 2-4 PM, 6-8 PM',
          scriptUk: 'Кращий час: 10-12, 14-16, 18-20',
          impact: 'Many leads never contacted',
          impactUk: 'Багато лідів не контактовано',
          priority: 3,
        };

      case 'QUALIFIED_NO_DEALS':
        return {
          title: 'Qualified Leads Not Closing',
          titleUk: 'Кваліфіковані ліди не закриваються',
          action: 'Focus on closing qualified leads first',
          actionUk: 'Фокус на закритті кваліфікованих лідів',
          script: 'Say: "Whats stopping you from making a decision today?"',
          scriptUk: 'Скажіть: "Що вас зупиняє прийняти рішення сьогодні?"',
          impact: 'Qualified leads are your highest value prospects',
          impactUk: 'Кваліфіковані ліди - найцінніші клієнти',
          priority: 2,
        };

      default:
        return null;
    }
  }
}
