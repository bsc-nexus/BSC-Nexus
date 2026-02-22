# BSC Nexus Development Skill

## Description

Enterprise BSC RPC Infrastructure development skill covering TypeScript/Node.js, Express, Prisma, Redis, blockchain RPC, circuit breakers, and multi-layer caching.

## Usage

```yaml
always_apply: true  # Read before every task
```

---

## Quick Reference

### Project Type
- **Backend API Gateway** for Binance Smart Chain
- **Tech Stack**: Node.js 18+, TypeScript 5.9+, Express, Prisma, PostgreSQL, Redis
- **Module System**: ESM (ES Modules) only

### Key Commands
```bash
npm run dev          # Development mode
npm run build        # TypeScript compile
npm test            # Run all tests
npm run validate    # Full validation
npm run db:migrate  # Database migration
```

### Critical Patterns

#### 1. ESM Imports (REQUIRED)
```typescript
// ✅ CORRECT - Always use .js extension
import { config } from '../config/env.js';

// ❌ WRONG - Never use .ts extension
import { config } from '../config/env.ts';
```

#### 2. Service Structure
```typescript
// services/featureService.ts
import { logger } from '../config/logger.js';

export class FeatureService {
  async doSomething() {
    logger.info('Doing something');
    // Implementation
  }
}

export const featureService = new FeatureService();
```

#### 3. Test Structure
```typescript
// tests/feature.unit.ts
import { TestResult } from './types.js';
import { featureService } from '../src/server/services/featureService.js';

export async function testFeature(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  // Tests here
  return results;
}
```

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Client    │────▶│  BSC Nexus   │────▶│  BSC Chain   │
│  (API Key)  │     │   Gateway    │     │   Nodes      │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐      ┌──────────┐      ┌──────────┐
   │  Cache  │      │ Circuit  │      │   MEV    │
   │  Layer  │      │ Breaker  │      │Protection│
   └─────────┘      └──────────┘      └──────────┘
```

### Core Services

| Service | File | Purpose |
|---------|------|---------|
| RPC Proxy v2 | `rpcProxyV2.ts` | Intelligent routing, caching, failover |
| Circuit Breaker | `circuitBreaker.ts` | Cascade failure prevention |
| Cache Service | `rpcCacheService.ts` | Redis + memory caching |
| MEV Protection | `mevProtectionService.ts` | Transaction protection |
| API Keys | `apiKeyService.ts` | Multi-tenant key management |
| Rate Limit | `rateLimitService.ts` | Request throttling |

---

## Development Rules

### DO ✅
- Use `.js` extension in all imports
- Use `logger` for all logging (structured)
- Mock database in unit tests
- Add tests for new features
- Handle all error cases
- Use TypeScript strict mode

### DON'T ❌
- Use CommonJS (`require`/`module.exports`)
- Connect to real database in tests
- Skip error handling
- Forget to update `.env.example`
- Use `any` type without justification

---

## Code Patterns

### Creating a New Service

```typescript
// src/server/services/myService.ts
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

export interface MyServiceOptions {
  // Options interface
}

export class MyService {
  async process(data: any) {
    try {
      logger.info('Processing', { data });
      // Implementation
      return { success: true };
    } catch (error: any) {
      logger.error('Processing failed', { error: error.message });
      throw error;
    }
  }
}

export const myService = new MyService();
```

### Creating a New Route

```typescript
// src/server/routes/myRoute.ts
import { Router, Request, Response } from 'express';
import { requireApiKey, AuthenticatedRequest } from '../middleware/auth.js';
import { myService } from '../services/myService.js';
import { logger } from '../config/logger.js';

const router = Router();

router.get('/v1/my-endpoint', requireApiKey, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await myService.process(req.query);
    res.json(result);
  } catch (error: any) {
    logger.error('Endpoint failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### Creating Tests

```typescript
// tests/my-service.unit.ts
import { TestResult } from './types.js';
import { myService } from '../src/server/services/myService.js';

export async function testMyService(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const start = Date.now();
  try {
    const result = await myService.process({ test: true });
    
    results.push({
      name: 'My service processes data',
      category: 'My Service',
      passed: result.success === true,
      duration: Date.now() - start,
      details: 'Service processed test data successfully'
    });
  } catch (error: any) {
    results.push({
      name: 'My service processes data',
      category: 'My Service',
      passed: false,
      duration: Date.now() - start,
      error: error.message
    });
  }

  return results;
}
```

---

## Environment Configuration

### Required Variables
```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/bscnexus

# RPC
BSC_PRIMARY_RPC_URL=https://bsc-dataseed.binance.org
BSC_FALLBACK_RPC_URLS=https://rpc1,https://rpc2

# Security
ADMIN_TOKEN=your-secure-token

# Optional
REDIS_URL=redis://localhost:6379
CACHE_ENABLED=true
METRICS_ENABLED=true
```

### Adding New Config
1. Add to `src/server/config/env.ts` interface `ServerConfig`
2. Add parsing in `loadConfig()` function
3. Add to `.env.example`
4. Document default behavior

---

## Database (Prisma)

### Schema Location
`prisma/schema.prisma`

### Common Operations
```bash
# After schema changes
npm run db:migrate    # Create migration
npm run db:generate   # Generate client
npm run db:studio     # Open Prisma Studio
```

### Mocking in Tests
```typescript
import { setPrismaClient } from '../src/server/services/apiKeyService.js';

const mockPrisma = {
  apiKey: {
    findUnique: async () => ({ id: 'test', isActive: true }),
    create: async (data: any) => ({ ...data.data, id: 'new-id' })
  }
};

setPrismaClient(mockPrisma as any);
```

---

## RPC Proxy v2 Features

### Method Caching
```typescript
import { rpcCacheService } from './services/rpcCacheService.js';

// Configure custom TTL
rpcCacheService.setCacheConfig('eth_call', {
  cacheable: true,
  ttl: 5000,        // 5 seconds
  blockAware: true  // Invalidate on new blocks
});
```

### Circuit Breaker
```typescript
import { circuitBreakerRegistry } from './services/circuitBreaker.js';

const cb = circuitBreakerRegistry.getOrCreate('endpoint', {
  failureThreshold: 5,
  timeoutMs: 30000
});

if (cb.canExecute()) {
  // Make request
}
```

### Proxy Request
```typescript
import { rpcProxyV2 } from './services/rpcProxyV2.js';

const response = await rpcProxyV2.proxyRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'eth_getBalance',
  params: ['0x...', 'latest']
}, { skipCache: false });
```

---

## Testing Guidelines

### Test Categories
- **Unit Tests**: `tests/*.unit.ts` - No external dependencies
- **Integration Tests**: `tests/*.ts` - Require running services

### Mock External Services
```typescript
// Mock axios
const originalPost = axios.post;
axios.post = async () => ({ data: { result: 'mocked' } });
// ... tests ...
axios.post = originalPost;

// Mock Prisma
setPrismaClient(mockPrisma as any);
// ... tests ...
setPrismaClient(defaultPrisma as any);
```

### Test Result Format
```typescript
{
  name: 'Test description',
  category: 'Category',
  passed: boolean,
  duration: number,
  details?: string,
  error?: string,
  suggestion?: string
}
```

---

## Logging Standards

### Levels
- `logger.error()` - Errors that need attention
- `logger.warn()` - Warnings, potential issues
- `logger.info()` - Important events (requests, state changes)
- `logger.debug()` - Detailed debugging info

### Format
```typescript
// Always use structured logging
logger.info('Event happened', {
  userId: '123',
  action: 'create',
  duration: '45ms',
  metadata: { key: 'value' }
});
```

---

## Metrics & Monitoring

### Prometheus Metrics
Available at `GET /metrics`

### Custom Metrics
```typescript
import { Counter, Histogram } from 'prom-client';

const myCounter = new Counter({
  name: 'bsc_nexus_my_metric_total',
  help: 'Description',
  labelNames: ['status']
});

myCounter.inc({ status: 'success' });
```

---

## Documentation Files

| File | Content |
|------|---------|
| `README.md` | Quick start, overview |
| `AGENTS.md` | This file - detailed guide |
| `docs/API_REFERENCE.md` | API endpoints |
| `docs/DEPLOYMENT_GUIDE.md` | Production deployment |
| `docs/RPC_PROXY_V2.md` | v2 features |
| `PROJECT_STATUS.md` | Current status |

---

## Troubleshooting

### TypeScript Errors
```bash
# Check for ESM issues (should use .js extensions)
npm run build

# Clear and rebuild
rm -rf dist/ && npm run build
```

### Test Failures
```bash
# Run single test file
npx tsx tests/my-test.unit.ts

# Check validation
npm run validate
```

### Database Issues
```bash
# Regenerate Prisma client
npm run db:generate

# Check connection
npx prisma db pull
```

---

## Security Checklist

- [ ] API endpoints use `requireApiKey` middleware
- [ ] Admin endpoints use `requireAdminToken` middleware  
- [ ] Input validation on all user inputs
- [ ] Rate limiting applied to expensive endpoints
- [ ] No secrets logged
- [ ] Errors don't leak sensitive info in production

---

*Skill Version: 1.0.0*
*Last Updated: 2026-02-19*
