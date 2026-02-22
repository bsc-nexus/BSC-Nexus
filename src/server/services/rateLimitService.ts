import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiKeyRecord } from './apiKeyServiceV2.js';

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour?: number | null;
  maxRequestsPerDay?: number | null;
  burstFactor?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  currentCount: number;
  limitType: 'minute' | 'hour' | 'day' | 'none';
}

interface RateLimitBucket {
  windowStart: number;
  count: number;
}

const MINUTE_WINDOW_MS = 60_000;
const HOUR_WINDOW_MS = 60 * 60_000;
const DAY_WINDOW_MS = 24 * 60 * 60_000;

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function normalizeLimit(limit: RateLimitConfig): RateLimitConfig {
  const burstFactor = limit.burstFactor && limit.burstFactor > 0 ? limit.burstFactor : 1;
  const maxPerMinute = limit.maxRequestsPerMinute > 0 ? limit.maxRequestsPerMinute : config.defaultRateLimitPerMinute;
  return {
    maxRequestsPerMinute: maxPerMinute,
    maxRequestsPerHour: limit.maxRequestsPerHour,
    maxRequestsPerDay: limit.maxRequestsPerDay,
    burstFactor,
  };
}

function bucketKey(apiKeyId: string, window: string): string {
  return `${apiKeyId}:${window}`;
}

function getWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

function getOrCreateBucket(apiKeyId: string, window: string, windowMs: number, now: number): RateLimitBucket {
  const key = bucketKey(apiKeyId, window);
  const windowStart = getWindowStart(now, windowMs);
  const existing = rateLimitBuckets.get(key);

  if (!existing || existing.windowStart !== windowStart) {
    const bucket: RateLimitBucket = { windowStart, count: 0 };
    rateLimitBuckets.set(key, bucket);
    return bucket;
  }

  return existing;
}

function getMaxRequests(limit: number, burstFactor: number): number {
  const burstMultiplier = burstFactor ?? 1;
  const rawMax = limit * burstMultiplier;
  return Math.max(1, Math.ceil(rawMax));
}

/**
 * Get effective rate limit configuration for an API key (V2)
 * Supports multi-level limits: per minute, hour, day
 */
export function getEffectiveLimitForApiKey(apiKey: ApiKeyRecord | undefined | null): RateLimitConfig {
  const perMinute = apiKey?.rateLimitPerMinute ?? config.defaultRateLimitPerMinute;
  const perHour = apiKey?.rateLimitPerHour ?? null;
  const perDay = apiKey?.rateLimitPerDay ?? null;
  
  return normalizeLimit({
    maxRequestsPerMinute: perMinute,
    maxRequestsPerHour: perHour,
    maxRequestsPerDay: perDay,
    burstFactor: config.rateLimitBurstFactor,
  });
}

/**
 * Check rate limit at multiple levels (minute, hour, day)
 */
export function checkAndConsume(apiKeyId: string, limit: RateLimitConfig, now = Date.now()): RateLimitResult {
  const normalized = normalizeLimit(limit);
  
  // Check day limit first (most restrictive)
  if (normalized.maxRequestsPerDay) {
    const dayBucket = getOrCreateBucket(apiKeyId, 'day', DAY_WINDOW_MS, now);
    const dayMax = getMaxRequests(normalized.maxRequestsPerDay, normalized.burstFactor ?? 1);
    
    if (dayBucket.count >= dayMax) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(dayBucket.windowStart + DAY_WINDOW_MS),
        currentCount: dayBucket.count,
        limitType: 'day',
      };
    }
  }
  
  // Check hour limit
  if (normalized.maxRequestsPerHour) {
    const hourBucket = getOrCreateBucket(apiKeyId, 'hour', HOUR_WINDOW_MS, now);
    const hourMax = getMaxRequests(normalized.maxRequestsPerHour, normalized.burstFactor ?? 1);
    
    if (hourBucket.count >= hourMax) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(hourBucket.windowStart + HOUR_WINDOW_MS),
        currentCount: hourBucket.count,
        limitType: 'hour',
      };
    }
  }
  
  // Check minute limit
  const minuteBucket = getOrCreateBucket(apiKeyId, 'minute', MINUTE_WINDOW_MS, now);
  const minuteMax = getMaxRequests(normalized.maxRequestsPerMinute, normalized.burstFactor ?? 1);
  
  if (minuteBucket.count >= minuteMax) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(minuteBucket.windowStart + MINUTE_WINDOW_MS),
      currentCount: minuteBucket.count,
      limitType: 'minute',
    };
  }
  
  // Increment all applicable buckets
  minuteBucket.count += 1;
  
  if (normalized.maxRequestsPerHour) {
    const hourBucket = getOrCreateBucket(apiKeyId, 'hour', HOUR_WINDOW_MS, now);
    hourBucket.count += 1;
  }
  
  if (normalized.maxRequestsPerDay) {
    const dayBucket = getOrCreateBucket(apiKeyId, 'day', DAY_WINDOW_MS, now);
    dayBucket.count += 1;
  }
  
  const remaining = Math.max(0, minuteMax - minuteBucket.count);
  
  return {
    allowed: true,
    remaining,
    resetAt: new Date(minuteBucket.windowStart + MINUTE_WINDOW_MS),
    currentCount: minuteBucket.count,
    limitType: 'none',
  };
}

export function getUsageSnapshot(apiKeyId: string, limit: RateLimitConfig, now = Date.now()): RateLimitResult {
  const normalized = normalizeLimit(limit);
  const minuteBucket = getOrCreateBucket(apiKeyId, 'minute', MINUTE_WINDOW_MS, now);
  const minuteMax = getMaxRequests(normalized.maxRequestsPerMinute, normalized.burstFactor ?? 1);
  
  return {
    allowed: minuteBucket.count < minuteMax,
    remaining: Math.max(0, minuteMax - minuteBucket.count),
    resetAt: new Date(minuteBucket.windowStart + MINUTE_WINDOW_MS),
    currentCount: minuteBucket.count,
    limitType: 'none',
  };
}

export function resetRateLimitState(): void {
  rateLimitBuckets.clear();
  logger.info('Rate limit state reset');
}

/**
 * Get detailed rate limit status for an API key
 */
export function getDetailedRateLimitStatus(
  apiKeyId: string, 
  limit: RateLimitConfig, 
  now = Date.now()
): {
  minute: { used: number; limit: number; remaining: number; resetAt: Date };
  hour: { used: number; limit: number | null; remaining: number; resetAt: Date | null };
  day: { used: number; limit: number | null; remaining: number; resetAt: Date | null };
} {
  const normalized = normalizeLimit(limit);
  
  const minuteBucket = getOrCreateBucket(apiKeyId, 'minute', MINUTE_WINDOW_MS, now);
  const minuteMax = getMaxRequests(normalized.maxRequestsPerMinute, normalized.burstFactor ?? 1);
  
  const hourBucket = normalized.maxRequestsPerHour 
    ? getOrCreateBucket(apiKeyId, 'hour', HOUR_WINDOW_MS, now)
    : null;
  const hourMax = normalized.maxRequestsPerHour 
    ? getMaxRequests(normalized.maxRequestsPerHour, normalized.burstFactor ?? 1)
    : null;
  
  const dayBucket = normalized.maxRequestsPerDay
    ? getOrCreateBucket(apiKeyId, 'day', DAY_WINDOW_MS, now)
    : null;
  const dayMax = normalized.maxRequestsPerDay
    ? getMaxRequests(normalized.maxRequestsPerDay, normalized.burstFactor ?? 1)
    : null;
  
  return {
    minute: {
      used: minuteBucket.count,
      limit: minuteMax,
      remaining: Math.max(0, minuteMax - minuteBucket.count),
      resetAt: new Date(minuteBucket.windowStart + MINUTE_WINDOW_MS),
    },
    hour: {
      used: hourBucket?.count ?? 0,
      limit: hourMax,
      remaining: hourMax ? Math.max(0, hourMax - (hourBucket?.count ?? 0)) : 0,
      resetAt: hourBucket ? new Date(hourBucket.windowStart + HOUR_WINDOW_MS) : null,
    },
    day: {
      used: dayBucket?.count ?? 0,
      limit: dayMax,
      remaining: dayMax ? Math.max(0, dayMax - (dayBucket?.count ?? 0)) : 0,
      resetAt: dayBucket ? new Date(dayBucket.windowStart + DAY_WINDOW_MS) : null,
    },
  };
}
