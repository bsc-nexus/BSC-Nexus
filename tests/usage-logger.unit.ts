import { EventEmitter } from 'events';
import { setPrismaClient as setUsagePrismaClient } from '../src/server/services/usageService.js';
import { prisma as defaultPrisma } from '../src/server/db/prisma.js';
import { usageLogger } from '../src/server/middleware/usageLogger.js';
import { AuthenticatedRequest } from '../src/server/middleware/auth.js';
import { TestResult } from './types.js';

interface UsageRecord {
  apiKeyId: string;
  endpoint: string;
  method?: string;
  statusCode: number;
  latencyMs: number;
  timestamp: Date;
}

class MockApiUsageDelegate {
  public records: UsageRecord[] = [];

  async create({ data }: { data: UsageRecord }): Promise<UsageRecord> {
    this.records.push(data);
    return data;
  }

  async groupBy(): Promise<any[]> {
    return [];
  }
}

class MockPrismaClient {
  apiUsage = new MockApiUsageDelegate();
}

export async function testUsageLogger(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const mockPrisma = new MockPrismaClient();
  setUsagePrismaClient(mockPrisma as any);

  const req: AuthenticatedRequest = {
    context: { apiKey: { id: 'api-key-1' } as any },
    route: { path: '/v1/rpc' } as any,
    path: '/v1/rpc',
    body: { method: 'eth_blockNumber' },
    method: 'POST',
  } as AuthenticatedRequest;

  const res = new EventEmitter() as any;
  res.statusCode = 200;
  res.on = res.on.bind(res);

  const start = Date.now();
  usageLogger(req, res, () => undefined);
  res.emit('finish');

  const recorded = mockPrisma.apiUsage.records[0];
  results.push({
    name: 'Usage logger captures API requests',
    category: 'Usage Logging',
    passed: !!recorded && recorded.apiKeyId === 'api-key-1' && recorded.endpoint === '/v1/rpc',
    duration: Date.now() - start,
    details: 'usageLogger writes entry via Prisma client',
  });

  setUsagePrismaClient(defaultPrisma as any);

  return results;
}
