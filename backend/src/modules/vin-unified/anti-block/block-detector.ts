/**
 * Block Detector
 * 
 * Detects various types of anti-bot blocks:
 * - Cloudflare challenges
 * - Captchas
 * - Rate limits
 * - Access denied pages
 */

export type BlockType =
  | 'none'
  | 'captcha'
  | 'cloudflare'
  | 'access_denied'
  | 'rate_limited'
  | 'bot_challenge'
  | 'unknown_block';

export interface BlockDetectionResult {
  blocked: boolean;
  type: BlockType;
  reason?: string;
}

/**
 * Detect if page is showing a block
 */
export function detectBlock(
  url: string,
  content: string,
  bodyText: string
): BlockDetectionResult {
  const lowerUrl = url.toLowerCase();
  const lowerContent = content.toLowerCase();
  const lowerText = bodyText.toLowerCase();

  // Cloudflare challenge
  if (
    lowerContent.includes('cf-challenge') ||
    lowerContent.includes('cloudflare') ||
    lowerText.includes('checking your browser') ||
    lowerText.includes('verify you are human') ||
    lowerText.includes('please wait while we verify')
  ) {
    return {
      blocked: true,
      type: 'cloudflare',
      reason: 'Cloudflare challenge detected',
    };
  }

  // Captcha
  if (
    lowerText.includes('captcha') ||
    lowerContent.includes('g-recaptcha') ||
    lowerContent.includes('hcaptcha') ||
    lowerContent.includes('recaptcha-anchor')
  ) {
    return {
      blocked: true,
      type: 'captcha',
      reason: 'Captcha detected',
    };
  }

  // Access denied
  if (
    lowerText.includes('access denied') ||
    lowerText.includes('forbidden') ||
    lowerText.includes('403 error') ||
    lowerUrl.includes('accessdenied')
  ) {
    return {
      blocked: true,
      type: 'access_denied',
      reason: 'Access denied page detected',
    };
  }

  // Rate limit
  if (
    lowerText.includes('too many requests') ||
    lowerText.includes('rate limit') ||
    lowerText.includes('temporarily blocked') ||
    lowerText.includes('429')
  ) {
    return {
      blocked: true,
      type: 'rate_limited',
      reason: 'Rate limit detected',
    };
  }

  // Bot challenge
  if (
    lowerText.includes('unusual traffic') ||
    lowerText.includes('automated queries') ||
    lowerText.includes('bot detected') ||
    lowerText.includes('suspicious activity')
  ) {
    return {
      blocked: true,
      type: 'bot_challenge',
      reason: 'Bot challenge detected',
    };
  }

  return {
    blocked: false,
    type: 'none',
  };
}

/**
 * Retry Policy
 */
export interface RetryDecision {
  shouldRetry: boolean;
  nextDelayMs: number;
  rotateProfile: boolean;
}

export function decideRetry(
  attempt: number,
  maxAttempts: number,
  blockType?: BlockType,
  errorMessage?: string
): RetryDecision {
  if (attempt >= maxAttempts) {
    return {
      shouldRetry: false,
      nextDelayMs: 0,
      rotateProfile: false,
    };
  }

  // Cloudflare/Captcha - retry with new profile
  if (blockType === 'cloudflare' || blockType === 'captcha') {
    return {
      shouldRetry: true,
      nextDelayMs: 2000 * attempt,
      rotateProfile: true,
    };
  }

  // Rate limit - longer delay
  if (blockType === 'rate_limited') {
    return {
      shouldRetry: true,
      nextDelayMs: 5000 * attempt,
      rotateProfile: true,
    };
  }

  // Bot challenge
  if (blockType === 'bot_challenge' || blockType === 'access_denied') {
    return {
      shouldRetry: true,
      nextDelayMs: 3000 * attempt,
      rotateProfile: true,
    };
  }

  // Timeout - quick retry
  if (errorMessage?.toLowerCase().includes('timeout')) {
    return {
      shouldRetry: true,
      nextDelayMs: 1000 * attempt,
      rotateProfile: false,
    };
  }

  // Navigation failed
  if (errorMessage?.toLowerCase().includes('navigation')) {
    return {
      shouldRetry: true,
      nextDelayMs: 1500 * attempt,
      rotateProfile: true,
    };
  }

  return {
    shouldRetry: false,
    nextDelayMs: 0,
    rotateProfile: false,
  };
}
