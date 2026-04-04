/**
 * Device Fingerprint Utility
 * 
 * Створення fingerprint для anti-abuse
 */

import { createHash } from 'crypto';

export function getDeviceFingerprint(req: any): string {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const ip = getClientIp(req);
  
  return createHash('sha256')
    .update(`${ua}|${lang}|${ip}`)
    .digest('hex')
    .substring(0, 32);
}

export function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}
