import { TestResult } from './types.js';
import { requireApiKey, requireAdminToken } from '../src/server/middleware/auth.js';
import { config } from '../src/server/config/env.js';
import { setPrismaClient } from '../src/server/services/apiKeyService.js';

// Mock Express request/response objects
function createMockRequest(headers: Record<string, string> = {}) {
  return {
    headers,
    path: '/test',
    ip: '127.0.0.1',
    body: {},
    context: undefined,
  };
}

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
}

export async function testSecurityMiddleware(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Admin token middleware - missing token
  const start1 = Date.now();
  try {
    const req = createMockRequest() as any;
    const res = createMockResponse();
    let nextCalled = false;
    
    requireAdminToken(req, res, () => { nextCalled = true; });
    
    const passed = res.statusCode === 401 && !nextCalled;
    results.push({
      name: 'Admin middleware rejects missing token',
      category: 'Security',
      passed,
      duration: Date.now() - start1,
      details: passed ? 'Returns 401 when token is missing' : `Expected 401, got ${res.statusCode}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Admin middleware rejects missing token',
      category: 'Security',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }

  // Test 2: Admin token middleware - invalid token
  const start2 = Date.now();
  try {
    const req = createMockRequest({ 'x-admin-token': 'invalid-token' }) as any;
    const res = createMockResponse();
    let nextCalled = false;
    
    requireAdminToken(req, res, () => { nextCalled = true; });
    
    const passed = res.statusCode === 401 && !nextCalled;
    results.push({
      name: 'Admin middleware rejects invalid token',
      category: 'Security',
      passed,
      duration: Date.now() - start2,
      details: passed ? 'Returns 401 for invalid token' : `Expected 401, got ${res.statusCode}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Admin middleware rejects invalid token',
      category: 'Security',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }

  // Test 3: Admin token middleware - valid token
  const start3 = Date.now();
  try {
    const req = createMockRequest({ 'x-admin-token': config.adminToken }) as any;
    const res = createMockResponse();
    let nextCalled = false;
    
    requireAdminToken(req, res, () => { nextCalled = true; });
    
    const passed = res.statusCode === 200 && nextCalled;
    results.push({
      name: 'Admin middleware accepts valid token',
      category: 'Security',
      passed,
      duration: Date.now() - start3,
      details: passed ? 'Calls next() for valid token' : 'Did not call next()',
    });
  } catch (error: any) {
    results.push({
      name: 'Admin middleware accepts valid token',
      category: 'Security',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }

  // Test 4: API key middleware - missing key
  const start4 = Date.now();
  try {
    const req = createMockRequest() as any;
    const res = createMockResponse();
    let nextCalled = false;
    
    await requireApiKey(req, res, () => { nextCalled = true; });
    
    const passed = res.statusCode === 401 && !nextCalled && res.jsonData?.error?.code === -32001;
    results.push({
      name: 'API key middleware rejects missing key',
      category: 'Security',
      passed,
      duration: Date.now() - start4,
      details: passed ? 'Returns 401 with proper error code' : `Status: ${res.statusCode}, Code: ${res.jsonData?.error?.code}`,
    });
  } catch (error: any) {
    results.push({
      name: 'API key middleware rejects missing key',
      category: 'Security',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }

  // Test 5: API key middleware - invalid key (mocked)
  const start5 = Date.now();
  try {
    // Set up mock Prisma client that returns null for any key lookup
    const mockPrisma = {
      apiKey: {
        findUnique: async () => null,
      },
    };
    setPrismaClient(mockPrisma as any);
    
    const req = createMockRequest({ 'x-api-key': 'invalid-key-12345' }) as any;
    const res = createMockResponse();
    let nextCalled = false;
    
    await requireApiKey(req, res, () => { nextCalled = true; });
    
    const passed = res.statusCode === 403 && !nextCalled && res.jsonData?.error?.code === -32002;
    results.push({
      name: 'API key middleware rejects invalid key',
      category: 'Security',
      passed,
      duration: Date.now() - start5,
      details: passed ? 'Returns 403 with proper error code' : `Status: ${res.statusCode}, Code: ${res.jsonData?.error?.code}`,
    });
  } catch (error: any) {
    results.push({
      name: 'API key middleware rejects invalid key',
      category: 'Security',
      passed: false,
      duration: Date.now() - start5,
      error: error.message,
    });
  }

  // Test 6: API key middleware - valid key (mocked)
  const start6 = Date.now();
  try {
    const validKey = {
      id: 'test-key-id',
      key: 'valid-test-key',
      tenantId: 'test-tenant',
      isActive: true,
      label: null,
      rateLimitPerMinute: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Set up mock Prisma client that returns the valid key
    const mockPrisma = {
      apiKey: {
        findUnique: async ({ where }: { where: { key: string } }) => {
          return where.key === validKey.key ? validKey : null;
        },
      },
    };
    setPrismaClient(mockPrisma as any);
    
    const req = createMockRequest({ 'x-api-key': validKey.key }) as any;
    const res = createMockResponse();
    let nextCalled = false;
    
    await requireApiKey(req, res, () => { nextCalled = true; });
    
    const passed = nextCalled && req.context?.apiKey?.id === validKey.id;
    results.push({
      name: 'API key middleware accepts valid key',
      category: 'Security',
      passed,
      duration: Date.now() - start6,
      details: passed ? 'Calls next() and sets context for valid key' : 'Did not call next() or set context',
    });
  } catch (error: any) {
    results.push({
      name: 'API key middleware accepts valid key',
      category: 'Security',
      passed: false,
      duration: Date.now() - start6,
      error: error.message,
    });
  }

  return results;
}
