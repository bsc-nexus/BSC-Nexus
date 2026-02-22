# BSC Nexus - Agent Development Guide

> **ALWAYS READ THIS FILE BEFORE STARTING ANY TASK ON THIS REPOSITORY**

---

## 📋 Project Overview

**BSC Nexus** is an enterprise-grade RPC gateway and trading infrastructure for Binance Smart Chain (BSC). It provides:

- **RPC Proxy v2** with circuit breakers, caching, and latency-based routing
- **Anti-MEV Protection** for transaction submissions
- **Ultra-Fast Swap** service for DeFi integrations
- **Multi-tenant API Key Management** with rate limiting
- **Enterprise Monitoring** with Prometheus metrics

---

## 🛠️ Tech Stack

### Core Technologies
| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | 18+ |
| Language | TypeScript | 5.9+ |
| Module System | ESM (ES Modules) | - |
| Framework | Express.js | 4.21+ |
| Database | PostgreSQL | 14+ |
| ORM | Prisma | 5.22+ |

### Key Dependencies
```json
{
  "web3": "^4.16.0",           // Blockchain interaction
  "axios": "^1.13.2",          // HTTP client
  "ioredis": "^5.x",           // Redis client (caching)
  "winston": "^3.17.0",        // Logging
  "prom-client": "^15.1.0",    // Prometheus metrics
  "express-rate-limit": "^7.5.0",
  "helmet": "^8.0.0",
  "cors": "^2.8.5"
}
```

### Development Tools
- **tsx** - TypeScript execution (no compilation needed for dev)
- **TypeScript Compiler** - For production builds
- **Custom Test Runner** - Located in `tests/`

---

## 🎯 Required Developer Skills

### Essential Skills
1. **TypeScript/Node.js** - Strong proficiency required
2. **Blockchain/RPC** - Understanding of JSON-RPC, Ethereum/BSC concepts
3. **Express.js** - Middleware, routing, error handling
4. **Prisma ORM** - Schema definition, migrations, queries
5. **Redis** - Caching strategies, TTL, pub/sub

### Nice to Have
- **Prometheus/Grafana** - Metrics and monitoring
- **Circuit Breaker Pattern** - Resilience engineering
- **MEV Protection** - Blockchain transaction security
- **Docker** - Containerization

---

## 📁 Project Structure

```
bsc-nexus/
├── src/
│   └── server/
│       ├── app.ts                    # Express app setup
│       ├── server.ts                 # Entry point
│       ├── config/
│       │   ├── env.ts               # Environment configuration
│       │   └── logger.ts            # Winston logger
│       ├── db/
│       │   └── prisma.ts            # Prisma client
│       ├── middleware/
│       │   ├── auth.ts              # API key & admin auth
│       │   ├── rateLimit.ts         # Rate limiting
│       │   ├── usageLogger.ts       # Usage tracking
│       │   └── errorHandler.ts      # Error handling
│       ├── routes/
│       │   ├── admin.ts             # Admin endpoints
│       │   ├── health.ts            # Health & metrics
│       │   ├── rpc.ts               # RPC proxy endpoint
│       │   └── tokens.ts            # Token info endpoint
│       └── services/
│           ├── apiKeyService.ts     # API key management
│           ├── circuitBreaker.ts    # Circuit breaker pattern ⭐
│           ├── mevProtectionService.ts
│           ├── metrics.ts           # Prometheus metrics
│           ├── rateLimitService.ts
│           ├── rpcCacheService.ts   # Multi-layer caching ⭐
│           ├── rpcProxy.ts          # Legacy v1 (keep for compat)
│           ├── rpcProxyV2.ts        # New v2 implementation ⭐
│           ├── tokenService.ts
│           ├── ultraFastSwapService.ts
│           └── usageService.ts
├── tests/
│   ├── test-runner.ts               # Test orchestration
│   ├── *.unit.ts                    # Unit tests
│   └── *.ts                         # Integration tests (legacy)
├── prisma/
│   └── schema.prisma               # Database schema
├── docs/
│   ├── API_REFERENCE.md
│   ├── DEPLOYMENT_GUIDE.md
│   └── RPC_PROXY_V2.md             # v2 documentation
├── package.json
├── tsconfig.json
└── validate.mjs                     # Validation script
```

---

## 🔧 Development Conventions

### Code Style
- **ESM Only** - Always use `import/export`, never `require/module.exports`
- **Strict TypeScript** - `strict: true` in tsconfig
- **Trailing Commas** - Preferred in multi-line objects/arrays
- **Semicolons** - Required

### File Naming
- Services: `camelCase.service.ts` (e.g., `rpcProxyV2.ts`)
- Routes: `camelCase.ts` (e.g., `health.ts`)
- Tests: `feature-name.unit.ts` or `feature-name.ts`
- Interfaces: PascalCase in same file or `types.ts`

### Import Patterns
```typescript
// Internal modules - always use .js extension for ESM
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

// External modules
import axios from 'axios';
import { Request, Response } from 'express';
```

### Error Handling
```typescript
// Always use typed errors
try {
  // ...
} catch (error: any) {
  logger.error('Operation failed', { 
    error: error.message,
    stack: error.stack 
  });
  // Return appropriate error response
}
```

### Logging
```typescript
// Use structured logging
logger.info('Event occurred', { 
  userId: '123',
  action: 'create',
  duration: '45ms'
});

// Levels: error, warn, info, debug
// In development: debug logs enabled
// In production: info and above
```

---

## 🧪 Testing Guidelines

### Running Tests
```bash
npm test                    # Run all tests
npm run build              # TypeScript compilation check
npm run validate           # Full validation suite
```

### Writing Tests
1. Create file: `tests/feature-name.unit.ts`
2. Import from source with `.js` extension
3. Mock external dependencies (Prisma, Redis, etc.)
4. Use `setPrismaClient()` for database mocking
5. Return `TestResult[]` array

```typescript
import { TestResult } from './types.js';
import { featureService } from '../src/server/services/featureService.js';

export async function testFeature(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test 1
  const start = Date.now();
  try {
    const result = await featureService.doSomething();
    results.push({
      name: 'Feature does something',
      category: 'Feature',
      passed: result.success,
      duration: Date.now() - start,
      details: 'Additional context'
    });
  } catch (error: any) {
    results.push({
      name: 'Feature does something',
      category: 'Feature',
      passed: false,
      duration: Date.now() - start,
      error: error.message
    });
  }
  
  return results;
}
```

---

## 🔑 Key Services Reference

### RPC Proxy v2 (rpcProxyV2.ts)
```typescript
import { rpcProxyV2 } from './services/rpcProxyV2.js';

// Proxy single request
const response = await rpcProxyV2.proxyRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'eth_getBalance',
  params: ['0x...', 'latest']
}, { skipCache: false });

// Get statistics
const stats = rpcProxyV2.getStats();
```

### Circuit Breaker (circuitBreaker.ts)
```typescript
import { circuitBreakerRegistry } from './services/circuitBreaker.js';

const cb = circuitBreakerRegistry.getOrCreate('endpoint-url', {
  failureThreshold: 5,
  timeoutMs: 30000
});

// Check state
if (cb.canExecute()) {
  // Make request
}
```

### Cache Service (rpcCacheService.ts)
```typescript
import { rpcCacheService } from './services/rpcCacheService.js';

// Configure caching for custom method
rpcCacheService.setCacheConfig('custom_method', {
  cacheable: true,
  ttl: 5000,        // 5 seconds
  blockAware: true  // Invalidate on new blocks
});

// Manual cache operations
await rpcCacheService.set(method, params, data);
const cached = await rpcCacheService.get(method, params);
```

---

## 🚀 Common Tasks

### Add New RPC Method Support
1. Update `CACHEABLE_METHODS` in `rpcProxyV2.ts` if cacheable
2. Add to `TRANSACTION_METHODS` if it needs MEV protection
3. Configure cache TTL in `rpcCacheService.ts`

### Add New Endpoint
1. Create route in `src/server/routes/`
2. Use `requireApiKey` middleware for protected routes
3. Use `requireAdminToken` for admin routes
4. Add rate limiting: `rateLimit` middleware
5. Add tests in `tests/`

### Database Changes
1. Update `prisma/schema.prisma`
2. Run `npm run db:migrate`
3. Run `npm run db:generate`
4. Update services that use the model

### Environment Variables
1. Add to `src/server/config/env.ts` interface
2. Add parsing logic in `loadConfig()`
3. Add to `.env.example`
4. Document default value

---

## ⚠️ Important Notes

### ESM Requirements
- Always use `.js` extension in imports, even for `.ts` files
- Use `import.meta.url` for __dirname equivalent
- Dynamic imports: `await import('./module.js')`

### Database in Tests
- Never connect to real database in unit tests
- Use `setPrismaClient(mockClient)` to inject mocks
- See `tests/api-key-service.unit.ts` for example

### Redis
- Redis is optional - falls back to in-memory cache
- Configure via `REDIS_URL` environment variable
- Always handle Redis connection errors gracefully

### TypeScript Strict Mode
- All strict checks enabled
- No implicit any
- Null checks required
- Must handle all code paths

---

## 📚 Documentation References

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview, quick start |
| `docs/API_REFERENCE.md` | API endpoint documentation |
| `docs/DEPLOYMENT_GUIDE.md` | Production deployment |
| `docs/RPC_PROXY_V2.md` | v2 features and migration |
| `PROJECT_STATUS.md` | Current status and roadmap |
| `QUICKSTART.md` | Development setup |

---

## 🐛 Troubleshooting

### Build Errors
```bash
# Clear build cache
rm -rf dist/
npm run build
```

### Database Connection Issues
```bash
# Regenerate Prisma client
npm run db:generate
```

### Test Failures
```bash
# Run specific test
npx tsx tests/specific-test.unit.ts
```

### Redis Connection
- Check `REDIS_URL` format: `redis://host:port`
- Ensure Redis server is running
- Falls back to memory cache if unavailable

---

## 📞 Getting Help

1. Check relevant documentation in `docs/`
2. Review existing services for patterns
3. Run `npm run validate` to verify setup
4. Check test files for usage examples

---

*Last Updated: 2026-02-19*
*Version: RPC Proxy v2 Release*
