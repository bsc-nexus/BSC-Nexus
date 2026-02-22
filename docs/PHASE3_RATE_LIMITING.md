Phase 3 – Rate Limiting & Observability
Overview

BSC Nexus now enforces per-API-key request limits over a rolling 60-second window. Each authenticated request consumes one slot from the key's bucket. When the bucket reaches the configured threshold the request is rejected immediately and the usage logger is not invoked, so only successful (non-rate-limited) calls appear in long-term usage analytics.

Configuration

Global defaults live in src/server/config/env.ts and can be overridden with environment variables:

Variable	Description	Default
DEFAULT_RATE_LIMIT_PER_MINUTE	Per-key requests per 60 seconds when no override is set on the key	RATE_LIMIT_MAX_REQUESTS (100)
RATE_LIMIT_BURST_FACTOR	Multiplier applied to the per-minute limit to allow small bursts	1
RATE_LIMIT_WINDOW_MS	Length of the rate-limit bucket (ms). Use only if you need a window other than 60 seconds.	60000

DEFAULT_RATE_LIMIT_PER_MINUTE inherits from RATE_LIMIT_MAX_REQUESTS if unset, so ops teams can continue using existing Express-style defaults without touching the new variable.

Individual API keys can override the limit using the rateLimitPerMinute field. When set, the override fully replaces the global default.

Error Responses

Clients receive channel-appropriate errors when the limit is exceeded:

RPC (/v1/rpc) – JSON-RPC error { code: -32004, message: "Rate limit exceeded" } with HTTP 429.

REST (/v1/tokens/:address/info, etc.) – JSON { "error": { "code": 429, "message": "Rate limit exceeded" } } with HTTP 429.

Observability & Operations

Operators can inspect limits and recent activity through the admin API (requires x-admin-token):

GET /admin/api-keys/:id/limits – Shows the effective limit (global vs override) and an in-memory snapshot of the current window (count, remaining, reset timestamp).

GET /admin/usage/recent?limit=50&apiKeyId=... – Returns recent ApiUsage rows by timestamp, filtered optionally by key.

GET /admin/usage/errors – Same as recent but includes only entries with statusCode >= 400.

These snapshots are best-effort because rate-limit counters currently live in memory. For production, connect rateLimitService to a shared cache (Redis recommended) for cross-instance enforcement without modifying the interface.