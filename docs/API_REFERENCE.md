# BSC Nexus API Reference

## Table of Contents
- [Authentication](#authentication)
- [RPC Endpoints](#rpc-endpoints)
- [Token Information](#token-information)
- [Ultra-Fast Swap](#ultra-fast-swap)
- [Admin Endpoints](#admin-endpoints)
- [Health & Monitoring](#health--monitoring)
- [WebSocket Support](#websocket-support)
- [Error Handling](#error-handling)

## Authentication

BSC Nexus uses API key authentication for all RPC and token endpoints.

### Headers
```
X-API-Key: your-api-key-here
```

## RPC Endpoints

### POST /v1/rpc
Forward JSON-RPC requests to BSC network with MEV protection and failover.

#### Request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_blockNumber",
  "params": []
}
```

#### Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x1234567"
}
```

#### Supported Methods
All standard Ethereum JSON-RPC methods plus:
- `eth_sendRawTransaction` - With MEV protection
- `eth_sendTransaction` - With MEV protection
- `eth_sendBundle` - Bundle transactions with MEV protection
- `bscnexus_getSwapQuote` - Get ultra-fast swap quote
- `bscnexus_executeSwap` - Execute ultra-fast swap

#### MEV Protection
Transactions are automatically protected unless disabled:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendRawTransaction",
  "params": ["0x..."],
  "meta": {
    "disableAntiMev": true  // Optional: disable MEV protection
  }
}
```

## Token Information

### GET /v1/tokens/:address/info
Get comprehensive token information.

#### Parameters
- `address` - Token contract address

#### Response
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "name": "Token Name",
    "symbol": "TKN",
    "decimals": 18,
    "totalSupply": "1000000000000000000000000",
    "price": {
      "usd": 1.23,
      "bnb": 0.0045
    },
    "marketCap": 1234567890,
    "volume24h": 987654,
    "holders": 12345,
    "verified": true
  }
}
```

## Ultra-Fast Swap

### bscnexus_getSwapQuote
Get optimal swap route and quote.

#### Request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "bscnexus_getSwapQuote",
  "params": [{
    "tokenIn": "0x...",
    "tokenOut": "0x...",
    "amountIn": "1000000000000000000",
    "recipient": "0x...",
    "deadline": 1234567890
  }]
}
```

#### Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "amountOut": "2000000000000000000",
    "amountOutMin": "1980000000000000000",
    "routes": [{
      "path": ["0x...", "0x..."],
      "pools": ["0x..."],
      "router": "0x...",
      "routerName": "PancakeSwap V2",
      "percentage": 100
    }],
    "priceImpact": "0.5",
    "estimatedGas": "250000",
    "effectiveRate": "2.0",
    "breakdown": {
      "inputValue": "1000000000000000000",
      "outputValue": "2000000000000000000",
      "minimumOutput": "1980000000000000000",
      "lpFees": "3000000000000000",
      "protocolFees": "0",
      "networkFees": "1000000000000000"
    },
    "warnings": [],
    "expiresAt": 1234567900
  }
}
```

### bscnexus_executeSwap
Execute swap with MEV protection.

#### Request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "bscnexus_executeSwap",
  "params": [{
    "tokenIn": "0x...",
    "tokenOut": "0x...",
    "amountIn": "1000000000000000000",
    "recipient": "0x...",
    "deadline": 1234567890
  }]
}
```

#### Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "txHash": "0x...",
    "status": "submitted",
    "submittedAt": 1234567890,
    "estimatedCompletionTime": 1234567900,
    "mevProtection": {
      "enabled": true,
      "method": "private-mempool",
      "confidence": 95
    }
  }
}
```

## Admin Endpoints

All admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>` header.

### POST /admin/tenants
Create new tenant organization.

#### Request
```json
{
  "name": "Organization Name",
  "email": "admin@example.com"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "id": "tenant-uuid",
    "name": "Organization Name",
    "email": "admin@example.com",
    "createdAt": "2024-11-21T12:00:00Z"
  }
}
```

### POST /admin/api-keys
Create API key for tenant.

#### Request
```json
{
  "tenantId": "tenant-uuid",
  "label": "Production API Key",
  "rateLimitPerMinute": 1000
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "id": "key-uuid",
    "key": "bsc-nexus-xxxxxxxxxx",
    "tenantId": "tenant-uuid",
    "label": "Production API Key",
    "rateLimitPerMinute": 1000,
    "isActive": true,
    "createdAt": "2024-11-21T12:00:00Z"
  }
}
```

### GET /admin/api-keys
List all API keys.

#### Response
```json
{
  "success": true,
  "data": [
    {
      "id": "key-uuid",
      "tenantId": "tenant-uuid",
      "label": "Production API Key",
      "rateLimitPerMinute": 1000,
      "isActive": true,
      "createdAt": "2024-11-21T12:00:00Z"
    }
  ]
}
```

### DELETE /admin/api-keys/:id
Deactivate API key.

#### Response
```json
{
  "success": true,
  "message": "API key deactivated"
}
```

### GET /admin/usage
Get usage statistics.

#### Query Parameters
- `startDate` - ISO 8601 date (optional)
- `endDate` - ISO 8601 date (optional)
- `apiKeyId` - Filter by API key (optional)
- `tenantId` - Filter by tenant (optional)

#### Response
```json
{
  "success": true,
  "data": {
    "totalRequests": 1000000,
    "uniqueApiKeys": 25,
    "averageLatencyMs": 45,
    "requestsByMethod": {
      "eth_blockNumber": 500000,
      "eth_sendRawTransaction": 100000
    },
    "requestsByEndpoint": {
      "/v1/rpc": 900000,
      "/v1/tokens": 100000
    }
  }
}
```

## Health & Monitoring

### GET /health
Service health check (no authentication required).

#### Response
```json
{
  "status": "healthy",
  "timestamp": "2024-11-21T12:00:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "components": {
    "database": "connected",
    "rpcUpstream": {
      "healthy": 3,
      "total": 3,
      "endpoints": [
        {
          "url": "https://bsc-dataseed.binance.org",
          "healthy": true,
          "successCount": 10000,
          "errorCount": 5,
          "lastSuccessAt": "2024-11-21T11:59:00Z"
        }
      ]
    },
    "mevProtection": {
      "enabled": true,
      "strategy": "private-mempool"
    }
  }
}
```

### GET /metrics
Prometheus metrics endpoint (no authentication required).

#### Response (Prometheus format)
```
# HELP rpc_requests_total Total RPC requests
# TYPE rpc_requests_total counter
rpc_requests_total{method="eth_blockNumber"} 500000
rpc_requests_total{method="eth_sendRawTransaction"} 100000

# HELP rpc_request_duration_seconds RPC request duration
# TYPE rpc_request_duration_seconds histogram
rpc_request_duration_seconds_bucket{le="0.1"} 900000
rpc_request_duration_seconds_bucket{le="0.5"} 990000
rpc_request_duration_seconds_sum 45000
rpc_request_duration_seconds_count 1000000

# HELP mev_protection_total MEV protection actions
# TYPE mev_protection_total counter
mev_protection_total{action="applied"} 95000
mev_protection_total{action="skipped"} 5000
```

## WebSocket Support

### WS /v1/ws
Real-time subscriptions (requires API key in connection params).

#### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/v1/ws?apiKey=your-api-key');
```

#### Subscribe to Events
```json
{
  "type": "subscribe",
  "topics": ["newBlocks", "pendingTransactions"]
}
```

#### Event Messages
```json
{
  "type": "event",
  "topic": "newBlock",
  "data": {
    "number": 1234567,
    "hash": "0x...",
    "timestamp": 1234567890
  }
}
```

## Error Handling

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later.",
    "details": {
      "limit": 100,
      "windowMs": 60000,
      "retryAfter": 45000
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Valid auth but insufficient permissions |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INVALID_REQUEST` | 400 | Malformed request body |
| `UPSTREAM_ERROR` | 502 | All RPC endpoints failed |
| `INTERNAL_ERROR` | 500 | Server error |

### Rate Limiting Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```