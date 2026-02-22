/**
 * RPC Proxy Service v2
 * 
 * Enhanced features:
 * - Latency-based routing (fastest endpoint wins)
 * - Request coalescing (deduplicate concurrent identical requests)
 * - Intelligent batching (bundle multiple requests)
 * - Circuit breaker integration
 * - Multi-layer caching
 * - Connection pooling
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import Web3 from 'web3';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import {
  rpcRequestCounter,
  rpcRequestDuration,
  rpcUpstreamRequestCounter,
  rpcUpstreamErrorsCounter,
  mevProtectionCounter,
} from './metrics.js';
import { mevProtectionService } from './mevProtectionService.js';
import { mevProtectionV2 } from './mevProtectionV2.js';
import { ultraFastSwapService } from './ultraFastSwapService.js';
import { ultraFastSwapV2 } from './ultraFastSwapV2.js';
import { rpcCacheService } from './rpcCacheService.js';
import { circuitBreakerRegistry, CircuitBreakerOpenError } from './circuitBreaker.js';
import { RequestContext } from '../middleware/auth.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params: any[];
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  meta?: Record<string, any>;
}

export interface JsonRpcBatchRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params: any[];
}

interface ProxyOptions {
  disableAntiMev?: boolean;
  timeout?: number;
  context?: RequestContext;
  skipCache?: boolean;
}

interface RpcEndpoint {
  url: string;
  weight: number;           // Load balancing weight
  priority: number;         // Priority for selection (lower = higher priority)
  timeoutMs: number;
  client: AxiosInstance;    // Reusable connection pool
  
  // Performance metrics
  latencyMs: number;        // Current average latency
  successCount: number;
  errorCount: number;
  consecutiveFailures: number;
  lastUsedAt: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  
  // Circuit breaker
  circuitBreaker: ReturnType<typeof circuitBreakerRegistry.getOrCreate>;
}

interface PendingRequest {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason: any) => void;
  timestamp: number;
}

const TRANSACTION_METHODS = ['eth_sendRawTransaction', 'eth_sendTransaction', 'eth_sendBundle'];
const ULTRAFAST_SWAP_METHODS = ['bscnexus_getSwapQuote', 'bscnexus_executeSwap'];
const CACHEABLE_METHODS = [
  'eth_chainId', 'net_version', 'eth_blockNumber',
  'eth_getBalance', 'eth_getTransactionCount', 'eth_getCode',
  'eth_call', 'eth_estimateGas', 'eth_gasPrice',
  'eth_getBlockByNumber', 'eth_getBlockByHash',
  'eth_getTransactionByHash', 'eth_getTransactionReceipt',
];

class RpcProxyV2 {
  private endpoints: RpcEndpoint[] = [];
  private coalescingMap: Map<string, PendingRequest[]> = new Map();
  private batchQueue: { request: JsonRpcRequest; resolve: Function; reject: Function }[] = [];
  private batchTimer?: NodeJS.Timeout;
  private latencyUpdateInterval?: NodeJS.Timeout;
  private readonly BATCH_WINDOW_MS = 10; // 10ms batching window
  private readonly LATENCY_WINDOW_SIZE = 10;

  constructor() {
    this.initializeEndpoints();
    this.startLatencyTracking();
    this.startBatchProcessor();
  }

  private initializeEndpoints(): void {
    const urls = Array.from(new Set([
      config.bscPrimaryRpcUrl, 
      ...config.bscFallbackRpcUrls
    ].filter((url): url is string => typeof url === 'string' && url.length > 0)));

    this.endpoints = urls.map((url, index) => ({
      url,
      weight: 100,
      priority: index,
      timeoutMs: config.rpcEndpointTimeoutMs,
      client: (axios as any).create({
        timeout: config.rpcEndpointTimeoutMs,
        headers: { 'Content-Type': 'application/json' },
      }),
      latencyMs: 0,
      successCount: 0,
      errorCount: 0,
      consecutiveFailures: 0,
      lastUsedAt: 0,
      circuitBreaker: circuitBreakerRegistry.getOrCreate(url, {
        failureThreshold: 5,
        timeoutMs: 30000,
      }),
    }));

    logger.info('RPC Proxy v2 initialized', { 
      endpoints: urls.length,
      batching: true,
      caching: true,
      circuitBreaker: true,
    });
  }

  /**
   * Latency-based endpoint selection with weighted load balancing
   */
  private selectEndpoint(): RpcEndpoint | null {
    const now = Date.now();
    
    // Filter healthy endpoints (circuit closed or half-open)
    const healthy = this.endpoints.filter(ep => {
      const state = ep.circuitBreaker.getState();
      return state === 'CLOSED' || (state === 'HALF_OPEN' && ep.circuitBreaker.canExecute());
    });

    if (healthy.length === 0) {
      // All circuits open - try to find one that's ready for half-open
      const readyForTest = this.endpoints.find(ep => ep.circuitBreaker.canExecute());
      if (readyForTest) return readyForTest;
      return null;
    }

    // Score-based selection: lower latency = higher score
    const scores = healthy.map(ep => {
      const latencyScore = ep.latencyMs > 0 ? 1000 / ep.latencyMs : 100;
      const weightScore = ep.weight;
      const priorityScore = (10 - ep.priority) * 10;
      return {
        endpoint: ep,
        score: latencyScore + weightScore + priorityScore,
      };
    });

    // Weighted random selection based on scores
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
    let random = Math.random() * totalScore;
    
    for (const { endpoint, score } of scores) {
      random -= score;
      if (random <= 0) {
        endpoint.lastUsedAt = now;
        return endpoint;
      }
    }

    return healthy[0];
  }

  /**
   * Request Coalescing: Deduplicate concurrent identical requests
   */
  private async coalesceRequest(
    request: JsonRpcRequest,
    fn: () => Promise<JsonRpcResponse>
  ): Promise<JsonRpcResponse> {
    // Only coalesce read operations
    if (TRANSACTION_METHODS.includes(request.method)) {
      return fn();
    }

    const key = `${request.method}:${JSON.stringify(request.params)}`;
    const pending = this.coalescingMap.get(key);

    if (pending) {
      // Request already in flight, add to waiters
      logger.debug('Coalescing request', { method: request.method, key: key.slice(0, 30) });
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject, timestamp: Date.now() });
      });
    }

    // Start new request
    this.coalescingMap.set(key, []);

    try {
      const result = await fn();
      
      // Resolve all waiters
      const waiters = this.coalescingMap.get(key);
      this.coalescingMap.delete(key);
      
      waiters?.forEach(w => {
        // Clone result for each waiter to avoid shared reference issues
        w.resolve({ ...result, id: request.id });
      });

      return result;
    } catch (error) {
      // Reject all waiters
      const waiters = this.coalescingMap.get(key);
      this.coalescingMap.delete(key);
      
      waiters?.forEach(w => w.reject(error));
      throw error;
    }
  }

  /**
   * Main proxy method with all v2 features
   */
  async proxyRequest(
    request: JsonRpcRequest,
    options: ProxyOptions = {}
  ): Promise<JsonRpcResponse> {
    const startTime = Date.now();
    const method = request.method;

    // Handle ultra-fast swap methods
    if (ULTRAFAST_SWAP_METHODS.includes(method)) {
      return this.handleUltraFastSwap(request);
    }

    // Check cache first (if not skipped)
    if (!options.skipCache && CACHEABLE_METHODS.includes(method)) {
      const cached = await rpcCacheService.get<JsonRpcResponse>(method, request.params);
      if (cached) {
        logger.debug('Cache hit', { method, id: request.id });
        return { ...cached, id: request.id, meta: { ...cached.meta, cached: true } };
      }
    }

    // Handle transaction methods with MEV protection
    if (TRANSACTION_METHODS.includes(method) && !options.disableAntiMev) {
      return this.handleTransactionWithMev(request, options);
    }

    // Use request coalescing for read operations
    return this.coalesceRequest(request, async () => {
      const response = await this.executeWithFailover(request, options);
      
      // Cache successful responses
      if (!response.error && !options.skipCache && CACHEABLE_METHODS.includes(method)) {
        await rpcCacheService.set(method, request.params, response);
      }

      return response;
    });
  }

  /**
   * Execute request with failover across multiple endpoints
   */
  private async executeWithFailover(
    request: JsonRpcRequest,
    options: ProxyOptions
  ): Promise<JsonRpcResponse> {
    const attempts: string[] = [];
    const startTime = Date.now();
    const errors: Error[] = [];

    while (attempts.length < this.endpoints.length) {
      const endpoint = this.selectEndpoint();
      
      if (!endpoint) {
        logger.error('All RPC endpoints unavailable (circuit breakers open)');
        break;
      }

      attempts.push(endpoint.url);

      try {
        const response = await endpoint.circuitBreaker.execute(async () => {
          const result = await endpoint.client.post<JsonRpcResponse>(
            endpoint.url,
            request,
            { timeout: options.timeout || endpoint.timeoutMs }
          );
          return result.data;
        });

        // Record success metrics
        this.recordSuccess(endpoint, Date.now() - startTime);
        
        rpcUpstreamRequestCounter.inc({ endpoint: endpoint.url, status: 'success' });
        rpcRequestDuration.observe({ method: request.method }, (Date.now() - startTime) / 1000);
        rpcRequestCounter.inc({ method: request.method, status: 'success' });

        logger.debug('RPC request succeeded', {
          method: request.method,
          endpoint: endpoint.url,
          attempts: attempts.length,
          latency: Date.now() - startTime,
        });

        return {
          ...response,
          meta: {
            endpoint: endpoint.url,
            attempts: attempts.length,
            latency: Date.now() - startTime,
          },
        };

      } catch (error: any) {
        this.recordFailure(endpoint, error);
        errors.push(error);
        
        rpcUpstreamErrorsCounter.inc({ endpoint: endpoint.url, reason: error.code || 'unknown' });

        logger.warn('RPC endpoint failed', {
          method: request.method,
          endpoint: endpoint.url,
          error: error.message,
          circuitState: endpoint.circuitBreaker.getState(),
        });

        // Don't retry client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          break;
        }
      }
    }

    // All endpoints failed
    rpcRequestCounter.inc({ method: request.method, status: 'error' });

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: 'All upstream RPC endpoints failed',
        data: {
          attempts,
          errors: errors.map(e => e.message),
        },
      },
    };
  }

  private recordSuccess(endpoint: RpcEndpoint, latencyMs: number): void {
    endpoint.successCount++;
    endpoint.consecutiveFailures = 0;
    endpoint.lastSuccessAt = Date.now();
    
    // Update rolling average latency
    const alpha = 2 / (this.LATENCY_WINDOW_SIZE + 1); // EMA smoothing factor
    endpoint.latencyMs = endpoint.latencyMs === 0 
      ? latencyMs 
      : endpoint.latencyMs * (1 - alpha) + latencyMs * alpha;
  }

  private recordFailure(endpoint: RpcEndpoint, error: Error): void {
    endpoint.errorCount++;
    endpoint.consecutiveFailures++;
    endpoint.lastFailureAt = Date.now();
    endpoint.circuitBreaker.recordFailure(error);
  }

  /**
   * Handle transaction with MEV protection v2
   */
  private async handleTransactionWithMev(
    request: JsonRpcRequest,
    options: ProxyOptions
  ): Promise<JsonRpcResponse> {
    if (!config.mevProtectionEnabled || options.disableAntiMev) {
      mevProtectionCounter.inc({ action: options.disableAntiMev ? 'skipped' : 'disabled' });
      return this.executeWithFailover(request, options);
    }

    const rawTx = request.params?.[0];
    if (typeof rawTx !== 'string') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32602, message: 'Invalid params for transaction submission' },
      };
    }

    try {
      // Use MEV Protection v2 with full protection features
      const result = await mevProtectionV2.protect(rawTx, {
        speed: 'fast',
        privacy: 'high',
        maxRebate: false,
        allowPublicFallback: true,
        maxWaitTimeMs: 30000,
        targetBlockOffset: 1,
      });

      if (result.success) {
        mevProtectionCounter.inc({ action: 'applied' });
        
        logger.info('MEV protection v2 applied', {
          provider: result.provider,
          protectionScore: result.protectionScore,
          riskLevel: result.mevRisk?.riskLevel,
          vulnerabilities: result.mevRisk?.vulnerabilities.length,
        });

        return {
          jsonrpc: '2.0',
          id: request.id,
          result: result.txHash,
          meta: {
            protection: {
              protected: true,
              provider: result.provider,
              score: result.protectionScore,
              riskLevel: result.mevRisk?.riskLevel,
              estimatedSavings: result.estimatedSavings,
            },
            bundleId: result.bundleId,
            blockNumber: result.blockNumber,
          },
        };
      } else {
        mevProtectionCounter.inc({ action: 'failed' });
        
        // If all providers failed and public fallback is allowed, use standard RPC
        if (result.status === 'failed' && result.errors?.some(e => e.includes('Public fallback'))) {
          logger.warn('MEV protection failed, falling back to standard RPC');
          return this.executeWithFailover(request, options);
        }

        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32010,
            message: 'MEV protection failed',
            data: result.errors,
          },
        };
      }
    } catch (error: any) {
      mevProtectionCounter.inc({ action: 'rejected' });
      logger.error('MEV protection v2 error', { error: error.message });
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32010,
          message: 'MEV protection rejected transaction',
          data: error.message,
        },
      };
    }
  }

  /**
   * Handle ultra-fast swap requests
   */
  private async handleUltraFastSwap(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      if (!config.ultrafastSwapEnabled) {
        throw new Error('Ultra-fast swap feature is disabled');
      }

      if (request.method === 'bscnexus_getSwapQuote') {
        const quote = await ultraFastSwapService.getSwapQuote(request.params?.[0]);
        return { jsonrpc: '2.0', id: request.id, result: quote };
      }

      if (request.method === 'bscnexus_executeSwap') {
        const result = await ultraFastSwapService.executeSwap(request.params?.[0]);
        return { jsonrpc: '2.0', id: request.id, result };
      }

      throw new Error(`Unsupported swap method: ${request.method}`);
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32015, message: 'Ultra-fast swap error', data: error.message },
      };
    }
  }

  /**
   * Intelligent batching for multiple requests
   */
  async proxyBatch(
    requests: JsonRpcRequest[],
    options: ProxyOptions = {}
  ): Promise<JsonRpcResponse[]> {
    // If only one request, don't batch
    if (requests.length === 1) {
      return [await this.proxyRequest(requests[0], options)];
    }

    const endpoint = this.selectEndpoint();
    if (!endpoint) {
      return requests.map(r => ({
        jsonrpc: '2.0',
        id: r.id,
        error: { code: -32603, message: 'No available endpoints' },
      }));
    }

    try {
      const response = await endpoint.client.post<JsonRpcResponse[]>(
        endpoint.url,
        requests,
        { timeout: options.timeout || endpoint.timeoutMs * 2 }
      );

      logger.debug('Batch request completed', {
        count: requests.length,
        endpoint: endpoint.url,
      });

      return response.data;
    } catch (error: any) {
      logger.error('Batch request failed', { error: error.message, count: requests.length });
      
      // Return errors for all requests
      return requests.map(r => ({
        jsonrpc: '2.0',
        id: r.id,
        error: { code: -32603, message: 'Batch request failed', data: error.message },
      }));
    }
  }

  /**
   * Background batch processor (for future use with async batching)
   */
  private startBatchProcessor(): void {
    // Reserved for future implementation of async request batching
  }

  /**
   * Periodically decay latency scores to adapt to changing conditions
   */
  private startLatencyTracking(): void {
    this.latencyUpdateInterval = setInterval(() => {
      // Decay old latency measurements slightly
      for (const endpoint of this.endpoints) {
        if (endpoint.latencyMs > 0) {
          endpoint.latencyMs *= 0.95; // 5% decay
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Get endpoint health status
   */
  getEndpointHealth(): Array<{
    url: string;
    healthy: boolean;
    latency: number;
    circuitState: string;
    successRate: number;
  }> {
    return this.endpoints.map(ep => {
      const total = ep.successCount + ep.errorCount;
      return {
        url: ep.url,
        healthy: ep.circuitBreaker.getState() === 'CLOSED',
        latency: Math.round(ep.latencyMs),
        circuitState: ep.circuitBreaker.getState(),
        successRate: total > 0 ? ep.successCount / total : 1,
      };
    });
  }

  /**
   * Get proxy statistics
   */
  getStats(): {
    endpoints: number;
    coalescingQueue: number;
    cacheStats: ReturnType<typeof rpcCacheService.getStats>;
    circuitBreakers: ReturnType<typeof circuitBreakerRegistry.getAllStats>;
  } {
    return {
      endpoints: this.endpoints.length,
      coalescingQueue: this.coalescingMap.size,
      cacheStats: rpcCacheService.getStats(),
      circuitBreakers: circuitBreakerRegistry.getAllStats(),
    };
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.latencyUpdateInterval) {
      clearInterval(this.latencyUpdateInterval);
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.coalescingMap.clear();
  }
}

// Export singleton instance
export const rpcProxyV2 = new RpcProxyV2();
