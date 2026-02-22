Phase 4: RPC Failover, MEV Protection, and Health/Metrics

This phase introduces a production-ready RPC engine with upstream failover, MEV-aware transaction handling, and expanded health/metrics reporting.

Configuration

Set the following environment variables to align with production defaults:
# Upstream RPC endpoints
BSC_PRIMARY_RPC_URL=https://bsc-dataseed.binance.org
BSC_FALLBACK_RPC_URLS=https://bsc-dataseed1.defibit.io,https://bsc-dataseed1.ninicoin.io
BSC_RPC_TIMEOUT_MS=15000
RPC_REQUEST_TIMEOUT_MS=15000
RPC_BACKOFF_BASE_MS=500
RPC_BACKOFF_MAX_MS=30000

# Feature flags
ENABLE_MEV_PROTECTION=true
MEV_PROTECTION_STRATEGY=private-mempool
MEV_PROTECTION_MIN_CONFIDENCE=70
MEV_PROTECTION_MAX_TIP=0
MEV_PROTECTION_VALIDATORS=binance,ankr
ENABLE_ULTRAFAST_SWAP=true
These values populate config in src/server/config/env.ts so services can consume a single typed configuration object.
RPC Failover Behavior


Requests are routed across the primary + fallback pool in a round-robin fashion, skipping endpoints that are in backoff.


Per-endpoint timeouts come from BSC_RPC_TIMEOUT_MS (overridable via RPC_REQUEST_TIMEOUT_MS).


Network/time-out/5xx errors trigger immediate retries against the next healthy endpoint until the pool is exhausted.


Exponential backoff is calculated from RPC_BACKOFF_BASE_MS and capped by RPC_BACKOFF_MAX_MS.


MEV Protection in the JSON-RPC Pipeline


Transaction submission methods (eth_sendRawTransaction, eth_sendTransaction, eth_sendBundle) are passed to mevProtectionService before hitting an upstream.


MEV behavior is controlled by ENABLE_MEV_PROTECTION and MEV_PROTECTION_STRATEGY (see mevProtectionService.ts for strategies).


Clients can temporarily bypass MEV protection by sending the x-disable-anti-mev: true header; the skip is logged and counted in metrics.


When MEV protection approves a transaction, the JSON-RPC response returns the protected transaction hash with metadata about the applied strategy.


Ultra-Fast Swap Routing


JSON-RPC methods bscnexus_getSwapQuote and bscnexus_executeSwap are routed to ultraFastSwapService when ENABLE_ULTRAFAST_SWAP=true.


Non-swap or unknown methods continue through the standard upstream routing path.


Observability


/health now reports database connectivity, per-endpoint RPC status (including backoff/last success), and MEV readiness.


Metrics include per-endpoint upstream counters and MEV protection outcomes (applied, skipped, rejected).


Use /metrics to scrape Prometheus-formatted data for dashboards and alerting.
