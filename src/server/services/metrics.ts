import client from 'prom-client';
import { logger } from '../config/logger.js';

const { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } = client as any;

export const register = new Registry();

// Default global metrics
collectDefaultMetrics({ register });

// RPC request duration
export const rpcRequestDuration = new Histogram({
  name: 'bsc_nexus_rpc_request_duration_seconds',
  help: 'Duration of RPC requests in seconds',
  labelNames: ['method', 'status'],
  registers: [register],
});

// RPC request counter
export const rpcRequestCounter = new Counter({
  name: 'bsc_nexus_rpc_requests_total',
  help: 'Total number of RPC requests',
  labelNames: ['method', 'status'],
  registers: [register],
});

// Token cache hits
export const tokenCacheHits = new Counter({
  name: 'bsc_nexus_token_cache_hits_total',
  help: 'Total token cache hits',
  registers: [register],
});

// Token cache misses
export const tokenCacheMisses = new Counter({
  name: 'bsc_nexus_token_cache_misses_total',
  help: 'Total token cache misses',
  registers: [register],
});

// Active connections gauge (used in app.ts)
export const activeConnectionsGauge = new Gauge({
  name: 'bsc_nexus_active_connections',
  help: 'Number of active HTTP connections',
  registers: [register],
});

// Upstream RPC request counter (used in rpcProxy)
export const rpcUpstreamRequestCounter = new Counter({
  name: 'bsc_nexus_rpc_upstream_requests_total',
  help: 'Total number of upstream RPC requests',
  labelNames: ['endpoint', 'status'],
  registers: [register],
});

// Upstream RPC error counter (used in rpcProxy)
export const rpcUpstreamErrorsCounter = new Counter({
  name: 'bsc_nexus_rpc_upstream_errors_total',
  help: 'Total number of upstream RPC errors',
  labelNames: ['endpoint', 'reason'],
  registers: [register],
});

// MEV protection outcomes (used in rpcProxy; note the action label)
export const mevProtectionCounter = new Counter({
  name: 'bsc_nexus_mev_protection_total',
  help: 'MEV protection decisions by strategy/outcome/action',
  labelNames: ['strategy', 'outcome', 'action'],
  registers: [register],
});

// Helper to expose metrics
export async function getMetrics(): Promise<string> {
  try {
    return await register.metrics();
  } catch (error: any) {
    logger.error('Error generating metrics', { error: error.message });
    throw error;
  }
}
