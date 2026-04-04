import { Injectable } from '@nestjs/common';
import { CallSessionStatus, NextActionType } from '../call-session.schema';

export interface NextStep {
  nextActionType: NextActionType;
  nextActionAt: Date;
  reason: string;
  reasonUk: string;
}

@Injectable()
export class CallFlowService {
  
  getNextStep(status: CallSessionStatus, attempts: number): NextStep {
    const now = new Date();

    switch (status) {
      case CallSessionStatus.CALLED_NO_ANSWER:
        if (attempts >= 3) {
          return {
            nextActionType: NextActionType.SMS,
            nextActionAt: this.addHours(now, 1),
            reason: '3+ attempts without answer - try SMS',
            reasonUk: '3+ спроби без відповіді - спробувати SMS',
          };
        }
        return {
          nextActionType: NextActionType.CALL,
          nextActionAt: this.addHours(now, 2),
          reason: 'No answer - retry in 2 hours',
          reasonUk: 'Не відповів - повторити через 2 години',
        };

      case CallSessionStatus.CALLBACK_REQUESTED:
        return {
          nextActionType: NextActionType.CALL,
          nextActionAt: this.getNextWorkingDay(10), // 10 AM next day
          reason: 'Callback requested - call tomorrow at 10 AM',
          reasonUk: 'Просив передзвонити - завтра о 10:00',
        };

      case CallSessionStatus.THINKING:
        return {
          nextActionType: NextActionType.CALL,
          nextActionAt: this.addHours(now, 24),
          reason: 'Client thinking - follow up in 24 hours',
          reasonUk: 'Клієнт думає - зв\'язатись через 24 години',
        };

      case CallSessionStatus.INTERESTED:
        return {
          nextActionType: NextActionType.CALL,
          nextActionAt: this.addHours(now, 2),
          reason: 'Client interested - follow up soon',
          reasonUk: 'Клієнт зацікавлений - зв\'язатись скоро',
        };

      case CallSessionStatus.NEGOTIATION:
        return {
          nextActionType: NextActionType.CLOSE,
          nextActionAt: this.addHours(now, 1),
          reason: 'In negotiation - push for close',
          reasonUk: 'На переговорах - тиснути на закриття',
        };

      case CallSessionStatus.NOT_INTERESTED:
      case CallSessionStatus.WRONG_NUMBER:
      case CallSessionStatus.DEAL:
        return {
          nextActionType: NextActionType.NONE,
          nextActionAt: now,
          reason: 'Session closed',
          reasonUk: 'Сесія закрита',
        };

      default:
        return {
          nextActionType: NextActionType.CALL,
          nextActionAt: now,
          reason: 'New lead - call now',
          reasonUk: 'Новий лід - дзвонити зараз',
        };
    }
  }

  // Helper: add hours to date
  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  // Helper: get next working day at specific hour
  private getNextWorkingDay(hour: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(hour, 0, 0, 0);

    // Skip weekends
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }

    return date;
  }

  // Check if within working hours
  isWorkingHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Weekday 9-21
    return day >= 1 && day <= 5 && hour >= 9 && hour < 21;
  }

  // Get optimal call time
  getOptimalCallTime(): Date {
    const now = new Date();
    
    if (this.isWorkingHours()) {
      return now;
    }

    // Schedule for next working hour
    const next = new Date(now);
    
    if (now.getHours() >= 21) {
      // Tomorrow 10 AM
      next.setDate(next.getDate() + 1);
      next.setHours(10, 0, 0, 0);
    } else if (now.getHours() < 9) {
      // Today 9 AM
      next.setHours(9, 0, 0, 0);
    }

    // Skip weekends
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }
}
