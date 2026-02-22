import { TestResult } from './types.js';
import {
  checkAndConsume,
  getEffectiveLimitForApiKey,
  resetRateLimitState,
} from '../src/server/services/rateLimitService.js';
import { ApiKeyRecord } from '../src/server/services/apiKeyService.js';

export async function testRateLimitService(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  resetRateLimitState();

  const now = Date.now();
  const limit = { maxRequestsPerMinute: 3 };

  const first = checkAndConsume('key-1', limit, now);
  const second = checkAndConsume('key-1', limit, now + 10);
  const third = checkAndConsume('key-1', limit, now + 20);
  const fourth = checkAndConsume('key-1', limit, now + 30);

  results.push({
    name: 'Allows requests until limit is reached',
    category: 'Rate Limiting',
    passed: first.allowed && second.allowed && third.allowed && !fourth.allowed,
    duration: 0,
    details: `Remaining after third request: ${third.remaining}`,
  });

  resetRateLimitState();
  const windowNow = Date.now();
  checkAndConsume('key-2', limit, windowNow);
  checkAndConsume('key-2', limit, windowNow + 10);
  checkAndConsume('key-2', limit, windowNow + 20);
  const afterReset = checkAndConsume('key-2', limit, windowNow + 61_000);

  results.push({
    name: 'Counters reset when window rolls over',
    category: 'Rate Limiting',
    passed: afterReset.allowed && afterReset.remaining === limit.maxRequestsPerMinute - 1,
    duration: 0,
    details: `Reset at: ${afterReset.resetAt.toISOString()}`,
  });

  resetRateLimitState();
  const customKey = { rateLimitPerMinute: 10 } as ApiKeyRecord;
  const effective = getEffectiveLimitForApiKey(customKey);
  const customFirst = checkAndConsume('key-3', effective, windowNow);
  let allowedCount = 1;
  for (let i = 0; i < 9; i += 1) {
    const result = checkAndConsume('key-3', effective, windowNow + i + 1);
    if (result.allowed) allowedCount += 1;
  }

  results.push({
    name: 'Custom API key limit overrides default',
    category: 'Rate Limiting',
    passed: effective.maxRequestsPerMinute === 10 && customFirst.allowed && allowedCount === 10,
    duration: 0,
    details: `Effective limit: ${effective.maxRequestsPerMinute}`,
  });

  return results;
}
