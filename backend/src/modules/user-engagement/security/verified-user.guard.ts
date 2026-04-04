/**
 * Verified User Guard
 * 
 * History reports тільки для верифікованих користувачів
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class VerifiedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Перевірка верифікації телефону або email
    const isVerified = user.phoneVerified || user.emailVerified || user.isVerified;
    
    if (!isVerified) {
      throw new ForbiddenException('Phone or email verification required to access history reports');
    }

    return true;
  }
}
