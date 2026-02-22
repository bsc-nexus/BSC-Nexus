import axios, { AxiosError } from 'axios';
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
import { ultraFastSwapService } from './ultraFastSwapService.js';
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

interface ProxyOptions {
  disableAntiMev?: boolean;
  timeout?: number;
  context?: RequestContext;
}

interface RpcEndpointState {
  url: string;
  timeoutMs: number;
  successCount: number;
  errorCount: number;
  consecutiveFailures: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  backoffUntil?: number;
}

const TRANSACTION_METHODS = ['eth_sendRawTransaction', 'eth_sendTransaction', 'eth_sendBundle'];
const ULTRAFAST_SWAP_METHODS = ['bscnexus_getSwapQuote', 'bscnexus_executeSwap'];

let rpcEndpoints: RpcEndpointState[] = buildRpcEndpoints();
let roundRobinIndex = 0;

function buildRpcEndpoints(): RpcEndpointState[] {
  const urls = Array.from(new Set([config.bscPrimaryRpcUrl, ...config.bscFallbackRpcUrls].filter(Boolean)));

  return urls.map(url => ({
    url,
    timeoutMs: config.rpcEndpointTimeoutMs,
    successCount: 0,
    errorCount: 0,
    consecutiveFailures: 0,
  }));
}

export function resetRpcEndpointPool(customUrls?: string[], timeoutMs?: number): void {
  const urls = customUrls && customUrls.length > 0 ? customUrls : undefined;
  rpcEndpoints = (urls || []).length > 0
    ? urls!.map(url => ({
        url,
        timeoutMs: timeoutMs || config.rpcEndpointTimeoutMs,
        successCount: 0,
        errorCount: 0,
        consecutiveFailures: 0,
      }))
    : buildRpcEndpoints();
  roundRobinIndex = 0;
}

function selectEndpoint(): RpcEndpointState | undefined {
  if (rpcEndpoints.length === 0) return undefined;

  const now = Date.now();
  const healthy = rpcEndpoints.filter(ep => !ep.backoffUntil || ep.backoffUntil <= now);

  if (healthy.length === 0) {
    // All endpoints are in backoff; pick the one that will recover soonest
    return rpcEndpoints.reduce((prev, curr) => {
      if (!prev.backoffUntil) return prev;
      if (!curr.backoffUntil) return curr;
      return prev.backoffUntil <= curr.backoffUntil ? prev : curr;
    });
  }

  const endpoint = healthy[roundRobinIndex % healthy.length];
  roundRobinIndex = (roundRobinIndex + 1) % healthy.length;
  return endpoint;
}

function markSuccess(endpoint: RpcEndpointState): void {
  endpoint.successCount += 1;
  endpoint.consecutiveFailures = 0;
  endpoint.lastSuccessAt = Date.now();
  endpoint.backoffUntil = undefined;
}

function markFailure(endpoint: RpcEndpointState): void {
  endpoint.errorCount += 1;
  endpoint.consecutiveFailures += 1;
  endpoint.lastFailureAt = Date.now();

  const backoff = Math.min(
    config.rpcBackoffMaxMs,
    config.rpcBackoffBaseMs * Math.pow(2, endpoint.consecutiveFailures - 1)
  );
  endpoint.backoffUntil = Date.now() + backoff;
}

function isRetriableError(error: any): boolean {
  if (!error) return false;

  if (error.code === 'ECONNABORTED') return true;
  if ((error as AxiosError).response) {
    const status = (error as AxiosError).response?.status || 0;
    return status >= 500;
  }

  return true;
}

async function forwardJsonRpc(
  endpoint: RpcEndpointState,
  body: JsonRpcRequest,
  timeoutOverride?: number
): Promise<JsonRpcResponse> {
  const timeout = timeoutOverride || endpoint.timeoutMs || config.rpcRequestTimeoutMs;

  const response = await axios.post<JsonRpcResponse>(endpoint.url, body, {
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

function isTransactionMethod(method: string): boolean {
  return TRANSACTION_METHODS.includes(method);
}

function isUltraFastSwapMethod(method: string): boolean {
  return ULTRAFAST_SWAP_METHODS.includes(method);
}

export function getRpcEndpointHealth(): Array<
  Omit<RpcEndpointState, 'timeoutMs'> & { healthy: boolean; timeoutMs: number }
> {
  const now = Date.now();
  return rpcEndpoints.map(endpoint => ({
    ...endpoint,
    timeoutMs: endpoint.timeoutMs,
    healthy: !endpoint.backoffUntil || endpoint.backoffUntil <= now,
  }));
}

async function handleUltraFastSwap(rpcRequest: JsonRpcRequest): Promise<JsonRpcResponse> {
  try {
    if (!config.ultrafastSwapEnabled) {
      throw new Error('Ultra-fast swap feature is disabled');
    }

    if (rpcRequest.method === 'bscnexus_getSwapQuote') {
      const quote = await ultraFastSwapService.getSwapQuote(rpcRequest.params?.[0]);
      return { jsonrpc: '2.0', id: rpcRequest.id, result: quote };
    }

    if (rpcRequest.method === 'bscnexus_executeSwap') {
      const result = await ultraFastSwapService.executeSwap(rpcRequest.params?.[0]);
      return { jsonrpc: '2.0', id: rpcRequest.id, result };
    }

    throw new Error(`Unsupported ultra-fast swap method: ${rpcRequest.method}`);
  } catch (error: any) {
    logger.error('Ultra-fast swap handling failed', {
      method: rpcRequest.method,
      error: error.message,
    });

    return {
      jsonrpc: '2.0',
      id: rpcRequest.id,
      error: {
        code: -32015,
        message: 'Ultra-fast swap error',
        data: error.message,
      },
    };
  }
}

async function applyMevProtection(
  rpcRequest: JsonRpcRequest,
  options: ProxyOptions
): Promise<JsonRpcResponse | null> {
  if (!isTransactionMethod(rpcRequest.method)) return null;
  if (!config.mevProtectionEnabled) return null;
  if (options.disableAntiMev) {
    mevProtectionCounter.inc({ action: 'skipped' });
    logger.info('MEV protection explicitly disabled for request', {
      id: rpcRequest.id,
      method: rpcRequest.method,
    });
    return null;
  }

  const rawTx = rpcRequest.params?.[0];
  if (typeof rawTx !== 'string') {
    return {
      jsonrpc: '2.0',
      id: rpcRequest.id,
      error: {
        code: -32602,
        message: 'Invalid params for transaction submission',
      },
    };
  }

  try {
    let parsedTx: any;
    try {
      // Attempt to decode the raw transaction hex
      const web3 = new Web3();
      parsedTx = web3.eth.accounts.signTransaction.decode(rawTx);
    } catch {
      // If decoding fails, just pass the raw tx
      parsedTx = { raw: rawTx };
    }

    const mevConfig = {
      enabled: true,
      strategy: config.mevProtectionStrategy,
      priorityLevel: 'high' as const,
      maxBribeTip: config.mevProtectionMaxTip,
      minConfidenceScore: config.mevProtectionMinConfidence,
      targetValidators: config.mevProtectionValidators,
    };

    const outcome = await mevProtectionService.protectTransaction(parsedTx as any, mevConfig);
    mevProtectionCounter.inc({ action: 'applied' });

    logger.info('MEV protection applied to transaction', {
      method: rpcRequest.method,
      id: rpcRequest.id,
      strategy: mevConfig.strategy,
      apiKeyId: options.context?.apiKey?.id,
    });

    return {
      jsonrpc: '2.0',
      id: rpcRequest.id,
      result: outcome.txHash,
      meta: { protection: outcome.protection },
    };
  } catch (error: any) {
    mevProtectionCounter.inc({ action: 'rejected' });
    logger.warn('MEV protection failed or rejected transaction', {
      error: error.message,
      method: rpcRequest.method,
    });

    return {
      jsonrpc: '2.0',
      id: rpcRequest.id,
      error: {
        code: -32010,
        message: 'MEV protection rejected transaction',
        data: error.message,
      },
    };
  }
}

/**
 * Main RPC proxy function with failover and MEV support
 */
export async function proxyRpcRequest(
  request: JsonRpcRequest,
  options: ProxyOptions = {}
): Promise<JsonRpcResponse> {
  if (isUltraFastSwapMethod(request.method)) {
    return handleUltraFastSwap(request);
  }

  const mevResponse = await applyMevProtection(request, options);
  if (mevResponse) {
    return mevResponse;
  }

  const attempts: string[] = [];

  while (attempts.length < rpcEndpoints.length) {
    const endpoint = selectEndpoint();
    if (!endpoint) break;

    attempts.push(endpoint.url);
    const attemptStart = Date.now();

    try {
      logger.debug('Forwarding RPC request to upstream', {
        method: request.method,
        id: request.id,
        endpoint: endpoint.url,
      });

      const response = await forwardJsonRpc(endpoint, request, options.timeout || config.rpcRequestTimeoutMs);
      markSuccess(endpoint);

      const duration = (Date.now() - attemptStart) / 1000;
      rpcUpstreamRequestCounter.inc({ endpoint: endpoint.url, status: 'success' });
      rpcRequestDuration.observe({ method: request.method }, duration);
      rpcRequestCounter.inc({ method: request.method, status: response.error ? 'error' : 'success' });

      logger.info('RPC request completed', {
        method: request.method,
        id: request.id,
        endpoint: endpoint.url,
        attempts: attempts.length,
        duration: `${duration.toFixed(3)}s`,
        hasError: !!response.error,
      });

      return { ...response, meta: { endpoint: endpoint.url, attempts: attempts.length } };
    } catch (error: any) {
      markFailure(endpoint);
      rpcUpstreamErrorsCounter.inc({ endpoint: endpoint.url });

      logger.warn('RPC upstream call failed', {
        method: request.method,
        id: request.id,
        endpoint: endpoint.url,
        attempts: attempts.length,
        error: error.message,
      });

      if (!isRetriableError(error)) {
        break;
      }
    }
  }

  rpcRequestCounter.inc({ method: request.method, status: 'error' });

  return {
    jsonrpc: '2.0',
    id: request.id,
    error: {
      code: -32603,
      message: 'All upstream RPC endpoints failed',
      data: { attempts },
    },
  };
}

/**
 * Validate JSON-RPC request format with security checks
 */
export function validateJsonRpcRequest(body: any): {
  valid: boolean;
  error?: string;
  request?: JsonRpcRequest;
} {
  // Check if body exists
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  // Check JSON-RPC version
  if (body.jsonrpc !== '2.0') {
    return { valid: false, error: 'Invalid JSON-RPC version, must be "2.0"' };
  }

  // Check method
  if (typeof body.method !== 'string' || body.method.length === 0) {
    return { valid: false, error: 'Method must be a non-empty string' };
  }

  // Sanitize method name to prevent injection
  if (!/^[a-zA-Z0-9_]+$/.test(body.method)) {
    return { valid: false, error: 'Invalid method name format' };
  }

  // Check id (can be number, string, or null)
  if (body.id !== undefined && body.id !== null) {
    if (typeof body.id !== 'number' && typeof body.id !== 'string') {
      return { valid: false, error: 'ID must be a number, string, or null' };
    }
  }

  // Check params (optional, but must be array if present)
  if (body.params !== undefined) {
    if (!Array.isArray(body.params)) {
      return { valid: false, error: 'Params must be an array' };
    }
    // Limit params array size to prevent DoS
    if (body.params.length > 100) {
      return { valid: false, error: 'Too many parameters (max 100)' };
    }
  }

  return {
    valid: true,
    request: {
      jsonrpc: '2.0',
      id: body.id ?? null,
      method: body.method,
      params: body.params ?? [],
    },
  };
}