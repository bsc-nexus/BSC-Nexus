import { setPrismaClient, createApiKey, getApiKeyByValue, deactivateApiKey, listApiKeys, ApiKeyRecord } from '../src/server/services/apiKeyService.js';
import { prisma as defaultPrisma } from '../src/server/db/prisma.js';
import { TestResult } from './types.js';

class MockApiKeyDelegate {
  private store: ApiKeyRecord[] = [];

  async create({ data }: { data: Partial<ApiKeyRecord> & { key: string; tenantId: string } }): Promise<ApiKeyRecord> {
    const record: ApiKeyRecord = {
      id: `key-${this.store.length + 1}`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      label: data.label ?? null,
      rateLimitPerMinute: data.rateLimitPerMinute ?? null,
      ...data,
    } as ApiKeyRecord;
    this.store.push(record);
    return record;
  }

  async findUnique({ where }: { where: { key: string } }): Promise<ApiKeyRecord | null> {
    return this.store.find(k => k.key === where.key) ?? null;
  }

  async findMany(): Promise<ApiKeyRecord[]> {
    return [...this.store];
  }

  async update({ where, data }: { where: { id: string }; data: Partial<ApiKeyRecord> }): Promise<ApiKeyRecord> {
    const idx = this.store.findIndex(k => k.id === where.id);
    if (idx === -1) {
      throw new Error('ApiKey not found');
    }
    const existing = this.store[idx];
    const updated: ApiKeyRecord = { ...existing, ...data, updatedAt: new Date() } as ApiKeyRecord;
    this.store[idx] = updated as ApiKeyRecord;
    return updated;
  }
}

class MockPrismaClient {
  apiKey: MockApiKeyDelegate;

  constructor() {
    this.apiKey = new MockApiKeyDelegate();
  }
}

export async function testApiKeyService(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const mockPrisma = new MockPrismaClient();
  setPrismaClient(mockPrisma as any);

  const startCreate = Date.now();
  const created = await createApiKey({ tenantId: 'tenant-1', label: 'test-key', rateLimitPerMinute: 120 });
  results.push({
    name: 'Create API key persists record',
    category: 'API Keys',
    passed: !!created.key && created.tenantId === 'tenant-1',
    duration: Date.now() - startCreate,
    details: 'createApiKey returns generated key and tenant association',
  });

  const startFetch = Date.now();
  const fetched = await getApiKeyByValue(created.key);
  results.push({
    name: 'Retrieve API key by value',
    category: 'API Keys',
    passed: fetched?.id === created.id,
    duration: Date.now() - startFetch,
    details: 'getApiKeyByValue returns stored key',
  });

  const startDeactivate = Date.now();
  await deactivateApiKey(created.id);
  const afterDeactivate = await getApiKeyByValue(created.key);
  results.push({
    name: 'Deactivate API key flag is set',
    category: 'API Keys',
    passed: afterDeactivate?.isActive === false,
    duration: Date.now() - startDeactivate,
    details: 'deactivateApiKey sets isActive=false',
  });

  const startList = Date.now();
  const listed = await listApiKeys();
  results.push({
    name: 'List API keys returns created keys',
    category: 'API Keys',
    passed: listed.length === 1 && listed[0].id === created.id,
    duration: Date.now() - startList,
    details: 'listApiKeys mirrors mock storage contents',
  });

  // restore default client for any subsequent operations
  setPrismaClient(defaultPrisma as any);

  return results;
}
