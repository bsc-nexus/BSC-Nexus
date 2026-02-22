import { TestResult } from './types.js';
import { rpcProxyV2 } from '../src/server/services/rpcProxyV2.js';
import { rpcCacheService } from '../src/server/services/rpcCacheService.js';
import { circuitBreakerRegistry, CircuitBreaker } from '../src/server/services/circuitBreaker.js';
import axios from 'axios';

const originalAxiosPost = axios.post;

export async function testRpcProxyV2(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Circuit Breaker - transitions from CLOSED to OPEN
  const start1 = Date.now();
  try {
    const cb = new CircuitBreaker('test-endpoint', {
      failureThreshold: 3,
      timeoutMs: 1000,
      successThreshold: 2,
    });

    // Initially closed
    let state = cb.getState();
    if (state !== 'CLOSED') {
      throw new Error(`Expected CLOSED, got ${state}`);
    }

    // Record failures to open circuit
    cb.recordFailure(new Error('fail 1'));
    cb.recordFailure(new Error('fail 2'));
    cb.recordFailure(new Error('fail 3'));

    state = cb.getState();
    const passed = state === 'OPEN';
    
    results.push({
      name: 'Circuit breaker opens after failures',
      category: 'RPC Proxy v2',
      passed,
      duration: Date.now() - start1,
      details: passed ? `Opened after 3 failures` : `State: ${state}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Circuit breaker opens after failures',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }

  // Test 2: Circuit Breaker - blocks requests when OPEN
  const start2 = Date.now();
  try {
    const cb = new CircuitBreaker('test-endpoint-2', {
      failureThreshold: 1,
      timeoutMs: 60000, // Long timeout to stay open
      successThreshold: 1,
    });

    cb.recordFailure(new Error('fail'));
    const canExecute = cb.canExecute();
    
    results.push({
      name: 'Circuit breaker blocks when OPEN',
      category: 'RPC Proxy v2',
      passed: !canExecute,
      duration: Date.now() - start2,
      details: !canExecute ? 'Correctly rejected request' : 'Allowed request when OPEN',
    });
  } catch (error: any) {
    results.push({
      name: 'Circuit breaker blocks when OPEN',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }

  // Test 3: Cache - stores and retrieves values
  const start3 = Date.now();
  try {
    await rpcCacheService.clear();
    
    const testData = { 
      jsonrpc: '2.0', 
      id: 1, 
      result: '0x38',
      meta: { cached: false }
    };
    
    // Set custom config for test method
    rpcCacheService.setCacheConfig('test_method', {
      cacheable: true,
      ttl: 5000,
      blockAware: false,
    });

    await rpcCacheService.set('test_method', ['param1'], testData);
    const cached = await rpcCacheService.get('test_method', ['param1']);
    
    const passed = cached?.result === '0x38';
    results.push({
      name: 'Cache stores and retrieves values',
      category: 'RPC Proxy v2',
      passed,
      duration: Date.now() - start3,
      details: passed ? 'Cache hit with correct data' : 'Cache miss or wrong data',
    });
  } catch (error: any) {
    results.push({
      name: 'Cache stores and retrieves values',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }

  // Test 4: Cache - respects TTL
  const start4 = Date.now();
  try {
    await rpcCacheService.clear();
    
    rpcCacheService.setCacheConfig('short_ttl_method', {
      cacheable: true,
      ttl: 1, // 1ms TTL
      blockAware: false,
    });

    await rpcCacheService.set('short_ttl_method', ['key'], { data: 'value' });
    
    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 10));
    
    const cached = await rpcCacheService.get('short_ttl_method', ['key']);
    
    results.push({
      name: 'Cache respects TTL expiration',
      category: 'RPC Proxy v2',
      passed: cached === null,
      duration: Date.now() - start4,
      details: cached === null ? 'Expired entry not returned' : 'Returned expired entry',
    });
  } catch (error: any) {
    results.push({
      name: 'Cache respects TTL expiration',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }

  // Test 5: Cache statistics tracking
  const start5 = Date.now();
  try {
    await rpcCacheService.clear();
    
    rpcCacheService.setCacheConfig('stats_test', {
      cacheable: true,
      ttl: 60000,
      blockAware: false,
    });

    // Miss
    await rpcCacheService.get('stats_test', ['key1']);
    
    // Set and hit
    await rpcCacheService.set('stats_test', ['key1'], { data: 'value' });
    await rpcCacheService.get('stats_test', ['key1']);
    
    const stats = rpcCacheService.getStats();
    
    results.push({
      name: 'Cache tracks hit/miss statistics',
      category: 'RPC Proxy v2',
      passed: stats.hits >= 1 && stats.misses >= 1,
      duration: Date.now() - start5,
      details: `Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`,
    });
  } catch (error: any) {
    results.push({
      name: 'Cache tracks hit/miss statistics',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start5,
      error: error.message,
    });
  }

  // Test 6: Proxy V2 endpoint health reporting
  const start6 = Date.now();
  try {
    const health = rpcProxyV2.getEndpointHealth();
    
    const passed = Array.isArray(health) && health.length > 0 && 
                   health.every(h => 
                     typeof h.url === 'string' &&
                     typeof h.healthy === 'boolean' &&
                     typeof h.latency === 'number' &&
                     typeof h.circuitState === 'string'
                   );
    
    results.push({
      name: 'Proxy v2 reports endpoint health',
      category: 'RPC Proxy v2',
      passed,
      duration: Date.now() - start6,
      details: passed ? `${health.length} endpoints monitored` : 'Invalid health structure',
    });
  } catch (error: any) {
    results.push({
      name: 'Proxy v2 reports endpoint health',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start6,
      error: error.message,
    });
  }

  // Test 7: Proxy V2 statistics
  const start7 = Date.now();
  try {
    const stats = rpcProxyV2.getStats();
    
    const passed = 
      typeof stats.endpoints === 'number' &&
      typeof stats.coalescingQueue === 'number' &&
      stats.cacheStats &&
      typeof stats.cacheStats.hits === 'number';
    
    results.push({
      name: 'Proxy v2 exposes detailed statistics',
      category: 'RPC Proxy v2',
      passed,
      duration: Date.now() - start7,
      details: passed ? `${stats.endpoints} endpoints, cache hits: ${stats.cacheStats.hits}` : 'Invalid stats',
    });
  } catch (error: any) {
    results.push({
      name: 'Proxy v2 exposes detailed statistics',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start7,
      error: error.message,
    });
  }

  // Test 8: Cache key generation
  const start8 = Date.now();
  try {
    const key1 = rpcCacheService.generateKey('eth_getBalance', ['0x123', 'latest']);
    const key2 = rpcCacheService.generateKey('eth_getBalance', ['0x123', 'latest']);
    const key3 = rpcCacheService.generateKey('eth_getBalance', ['0x456', 'latest']);
    
    const passed = key1 === key2 && key1 !== key3;
    
    results.push({
      name: 'Cache generates consistent keys',
      category: 'RPC Proxy v2',
      passed,
      duration: Date.now() - start8,
      details: passed ? 'Same params = same key, different params = different key' : 'Key collision or inconsistency',
    });
  } catch (error: any) {
    results.push({
      name: 'Cache generates consistent keys',
      category: 'RPC Proxy v2',
      passed: false,
      duration: Date.now() - start8,
      error: error.message,
    });
  }

  // Cleanup
  await rpcCacheService.clear();
  circuitBreakerRegistry.resetAll();

  return results;
}
