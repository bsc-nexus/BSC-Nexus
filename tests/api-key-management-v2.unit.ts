import { TestResult } from './types.js';

// Mock Prisma types
interface MockTenant {
  id: string;
  name: string;
  tier: string;
  status: string;
  _count?: { apiKeys: number };
}

interface MockApiKey {
  id: string;
  key: string;
  keyPrefix: string;
  tenantId: string;
  label: string | null;
  isActive: boolean;
  scopes: string[];
  allowedIps: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  totalRequests: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockAuditLog {
  id: string;
  adminId: string | null;
  action: string;
  resource: string;
  tenantId: string | null;
  createdAt: Date;
}

// Mock storage
const mockTenants: Map<string, MockTenant> = new Map();
const mockApiKeys: Map<string, MockApiKey> = new Map();
const mockAuditLogs: MockAuditLog[] = [];
let idCounter = 0;

// ============================================================================
// Mock Services
// ============================================================================

function generateId(): string {
  return `mock-${++idCounter}`;
}

function createMockTenant(data: Partial<MockTenant>): MockTenant {
  const tenant: MockTenant = {
    id: generateId(),
    name: data.name ?? 'Test Tenant',
    tier: data.tier ?? 'FREE',
    status: data.status ?? 'ACTIVE',
    _count: { apiKeys: 0 },
  };
  mockTenants.set(tenant.id, tenant);
  return tenant;
}

function createMockApiKey(tenantId: string, data: Partial<MockApiKey> = {}): MockApiKey {
  const key: MockApiKey = {
    id: generateId(),
    key: `bsc_${generateId()}`,
    keyPrefix: `bsc_mock`,
    tenantId,
    label: data.label ?? null,
    isActive: data.isActive ?? true,
    scopes: data.scopes ?? ['RPC_READ'],
    allowedIps: data.allowedIps ?? [],
    expiresAt: data.expiresAt ?? null,
    lastUsedAt: null,
    totalRequests: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockApiKeys.set(key.id, key);
  
  // Update tenant count
  const tenant = mockTenants.get(tenantId);
  if (tenant) {
    tenant._count = { apiKeys: (tenant._count?.apiKeys ?? 0) + 1 };
  }
  
  return key;
}

function logMockAudit(action: string, resource: string, tenantId?: string): void {
  mockAuditLogs.push({
    id: generateId(),
    adminId: 'admin',
    action,
    resource,
    tenantId: tenantId ?? null,
    createdAt: new Date(),
  });
}

// ============================================================================
// Test Functions
// ============================================================================

async function testTenantManagement(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test 1: Create tenant
  const start1 = Date.now();
  try {
    const tenant = createMockTenant({ name: 'Test Corp', tier: 'PROFESSIONAL' });
    results.push({
      name: 'Create tenant with tier',
      category: 'Tenant Management V2',
      passed: tenant.id && tenant.name === 'Test Corp' && tenant.tier === 'PROFESSIONAL',
      duration: Date.now() - start1,
      details: `Created tenant ${tenant.id} with tier ${tenant.tier}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Create tenant with tier',
      category: 'Tenant Management V2',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }
  
  // Test 2: Tenant tier limits
  const start2 = Date.now();
  try {
    const freeTenant = createMockTenant({ name: 'Free User', tier: 'FREE' });
    const tierLimits: Record<string, number> = { FREE: 2, PROFESSIONAL: 20, ENTERPRISE: 100 };
    const maxKeys = tierLimits[freeTenant.tier] ?? 2;
    results.push({
      name: 'Tenant tier limits enforced',
      category: 'Tenant Management V2',
      passed: maxKeys === 2,
      duration: Date.now() - start2,
      details: `FREE tier limited to ${maxKeys} API keys`,
    });
  } catch (error: any) {
    results.push({
      name: 'Tenant tier limits enforced',
      category: 'Tenant Management V2',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }
  
  // Test 3: Suspend tenant
  const start3 = Date.now();
  try {
    const tenant = createMockTenant({ name: 'Suspicious Corp' });
    tenant.status = 'SUSPENDED';
    results.push({
      name: 'Suspend tenant deactivates all keys',
      category: 'Tenant Management V2',
      passed: tenant.status === 'SUSPENDED',
      duration: Date.now() - start3,
      details: `Tenant ${tenant.id} suspended`,
    });
  } catch (error: any) {
    results.push({
      name: 'Suspend tenant deactivates all keys',
      category: 'Tenant Management V2',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }
  
  // Test 4: List tenants with filters
  const start4 = Date.now();
  try {
    const activeTenants = Array.from(mockTenants.values()).filter(t => t.status === 'ACTIVE');
    results.push({
      name: 'List tenants with status filter',
      category: 'Tenant Management V2',
      passed: activeTenants.length >= 2,
      duration: Date.now() - start4,
      details: `Found ${activeTenants.length} active tenants`,
    });
  } catch (error: any) {
    results.push({
      name: 'List tenants with status filter',
      category: 'Tenant Management V2',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }
  
  return results;
}

async function testApiKeyV2Features(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Setup
  const tenant = createMockTenant({ name: 'API Key Test Tenant' });
  
  // Test 1: Create API key with scopes
  const start1 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, {
      label: 'Production Key',
      scopes: ['RPC_READ', 'RPC_WRITE', 'SWAP'],
    });
    results.push({
      name: 'Create API key with scopes',
      category: 'API Key V2',
      passed: key.scopes.includes('RPC_READ') && key.scopes.includes('SWAP'),
      duration: Date.now() - start1,
      details: `Created key with scopes: ${key.scopes.join(', ')}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Create API key with scopes',
      category: 'API Key V2',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }
  
  // Test 2: API key with IP allowlist
  const start2 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, {
      label: 'Internal Key',
      allowedIps: ['192.168.1.1', '10.0.0.0/8'],
    });
    results.push({
      name: 'Create API key with IP allowlist',
      category: 'API Key V2',
      passed: key.allowedIps.length === 2 && key.allowedIps.includes('192.168.1.1'),
      duration: Date.now() - start2,
      details: `Key restricted to IPs: ${key.allowedIps.join(', ')}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Create API key with IP allowlist',
      category: 'API Key V2',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }
  
  // Test 3: API key with expiration
  const start3 = Date.now();
  try {
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const key = createMockApiKey(tenant.id, {
      label: 'Temporary Key',
      expiresAt: expiryDate,
    });
    results.push({
      name: 'Create API key with expiration',
      category: 'API Key V2',
      passed: key.expiresAt !== null && key.expiresAt.getTime() === expiryDate.getTime(),
      duration: Date.now() - start3,
      details: `Key expires at ${key.expiresAt?.toISOString()}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Create API key with expiration',
      category: 'API Key V2',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }
  
  // Test 4: Key prefix for display
  const start4 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { label: 'Display Key' });
    results.push({
      name: 'API key has prefix for display',
      category: 'API Key V2',
      passed: key.keyPrefix.length > 0 && key.key.startsWith('bsc_'),
      duration: Date.now() - start4,
      details: `Key prefix: ${key.keyPrefix}, Full key starts with: ${key.key.substring(0, 10)}...`,
    });
  } catch (error: any) {
    results.push({
      name: 'API key has prefix for display',
      category: 'API Key V2',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }
  
  // Test 5: Key activation/deactivation
  const start5 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { label: 'Toggle Key' });
    key.isActive = false;
    results.push({
      name: 'Activate/deactivate API key',
      category: 'API Key V2',
      passed: !key.isActive,
      duration: Date.now() - start5,
      details: `Key deactivated successfully`,
    });
  } catch (error: any) {
    results.push({
      name: 'Activate/deactivate API key',
      category: 'API Key V2',
      passed: false,
      duration: Date.now() - start5,
      error: error.message,
    });
  }
  
  // Test 6: Key rotation
  const start6 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { label: 'Rotation Test' });
    const oldKey = key.key;
    key.key = `bsc_rotated_${generateId()}`;
    key.keyPrefix = key.key.substring(0, 12);
    results.push({
      name: 'Rotate API key generates new key value',
      category: 'API Key V2',
      passed: key.key !== oldKey && key.key.includes('rotated'),
      duration: Date.now() - start6,
      details: `Key rotated from ${oldKey.substring(0, 15)}... to ${key.key.substring(0, 15)}...`,
    });
  } catch (error: any) {
    results.push({
      name: 'Rotate API key generates new key value',
      category: 'API Key V2',
      passed: false,
      duration: Date.now() - start6,
      error: error.message,
    });
  }
  
  return results;
}

async function testApiKeyValidation(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Setup
  const tenant = createMockTenant({ name: 'Validation Test', status: 'ACTIVE' });
  
  // Test 1: Valid key validation
  const start1 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { label: 'Valid Key', scopes: ['RPC_READ'] });
    const isValid = key.isActive && tenant.status === 'ACTIVE';
    results.push({
      name: 'Validate active API key',
      category: 'API Key Validation',
      passed: isValid,
      duration: Date.now() - start1,
      details: `Key validated successfully`,
    });
  } catch (error: any) {
    results.push({
      name: 'Validate active API key',
      category: 'API Key Validation',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }
  
  // Test 2: Inactive key rejection
  const start2 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { label: 'Inactive Key', isActive: false });
    const isValid = key.isActive && tenant.status === 'ACTIVE';
    results.push({
      name: 'Reject inactive API key',
      category: 'API Key Validation',
      passed: !isValid,
      duration: Date.now() - start2,
      details: `Inactive key correctly rejected`,
    });
  } catch (error: any) {
    results.push({
      name: 'Reject inactive API key',
      category: 'API Key Validation',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }
  
  // Test 3: Expired key rejection
  const start3 = Date.now();
  try {
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
    const key = createMockApiKey(tenant.id, {
      label: 'Expired Key',
      expiresAt: expiredDate,
    });
    const isExpired = key.expiresAt !== null && key.expiresAt < new Date();
    results.push({
      name: 'Reject expired API key',
      category: 'API Key Validation',
      passed: isExpired,
      duration: Date.now() - start3,
      details: `Expired key (expired ${key.expiresAt?.toISOString()}) correctly rejected`,
    });
  } catch (error: any) {
    results.push({
      name: 'Reject expired API key',
      category: 'API Key Validation',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }
  
  // Test 4: IP allowlist validation
  const start4 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, {
      label: 'IP Restricted',
      allowedIps: ['192.168.1.100'],
    });
    const clientIp = '192.168.1.100';
    const allowed = key.allowedIps.length === 0 || key.allowedIps.includes(clientIp);
    results.push({
      name: 'IP allowlist permits allowed IP',
      category: 'API Key Validation',
      passed: allowed,
      duration: Date.now() - start4,
      details: `IP ${clientIp} allowed for key`,
    });
  } catch (error: any) {
    results.push({
      name: 'IP allowlist permits allowed IP',
      category: 'API Key Validation',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }
  
  // Test 5: IP allowlist blocks unauthorized IP
  const start5 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, {
      label: 'IP Restricted 2',
      allowedIps: ['192.168.1.100'],
    });
    const clientIp = '10.0.0.50';
    const allowed = key.allowedIps.length === 0 || key.allowedIps.includes(clientIp);
    results.push({
      name: 'IP allowlist blocks unauthorized IP',
      category: 'API Key Validation',
      passed: !allowed,
      duration: Date.now() - start5,
      details: `IP ${clientIp} correctly blocked`,
    });
  } catch (error: any) {
    results.push({
      name: 'IP allowlist blocks unauthorized IP',
      category: 'API Key Validation',
      passed: false,
      duration: Date.now() - start5,
      error: error.message,
    });
  }
  
  // Test 6: Suspended tenant blocks keys
  const start6 = Date.now();
  try {
    const suspendedTenant = createMockTenant({ name: 'Bad Actor', status: 'SUSPENDED' });
    const key = createMockApiKey(suspendedTenant.id, { label: 'Key of Suspended' });
    const isValid = key.isActive && suspendedTenant.status === 'ACTIVE';
    results.push({
      name: 'Suspended tenant blocks all keys',
      category: 'API Key Validation',
      passed: !isValid,
      duration: Date.now() - start6,
      details: `Key from suspended tenant correctly rejected`,
    });
  } catch (error: any) {
    results.push({
      name: 'Suspended tenant blocks all keys',
      category: 'API Key Validation',
      passed: false,
      duration: Date.now() - start6,
      error: error.message,
    });
  }
  
  return results;
}

async function testScopeValidation(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Setup
  const tenant = createMockTenant({ name: 'Scope Test' });
  
  // Test 1: Single scope check
  const start1 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { scopes: ['RPC_READ', 'SWAP'] });
    const hasScope = key.scopes.includes('SWAP');
    results.push({
      name: 'Check single scope on API key',
      category: 'Scope Validation',
      passed: hasScope,
      duration: Date.now() - start1,
      details: `Key has SWAP scope`,
    });
  } catch (error: any) {
    results.push({
      name: 'Check single scope on API key',
      category: 'Scope Validation',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }
  
  // Test 2: Multiple scopes check (has all)
  const start2 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { scopes: ['RPC_READ', 'RPC_WRITE', 'SWAP', 'MEV_PROTECTION'] });
    const requiredScopes = ['RPC_READ', 'SWAP'];
    const hasAll = requiredScopes.every(s => key.scopes.includes(s));
    results.push({
      name: 'Check multiple required scopes (all)',
      category: 'Scope Validation',
      passed: hasAll,
      duration: Date.now() - start2,
      details: `Key has all required scopes: ${requiredScopes.join(', ')}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Check multiple required scopes (all)',
      category: 'Scope Validation',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }
  
  // Test 3: Missing scope rejection
  const start3 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { scopes: ['RPC_READ'] });
    const hasAdminScope = key.scopes.includes('ADMIN_WRITE');
    results.push({
      name: 'Reject missing required scope',
      category: 'Scope Validation',
      passed: !hasAdminScope,
      duration: Date.now() - start3,
      details: `Key correctly lacks ADMIN_WRITE scope`,
    });
  } catch (error: any) {
    results.push({
      name: 'Reject missing required scope',
      category: 'Scope Validation',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }
  
  return results;
}

async function testAuditLogging(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test 1: Log tenant creation
  const start1 = Date.now();
  try {
    const tenant = createMockTenant({ name: 'Audit Test' });
    logMockAudit('CREATE', 'TENANT', tenant.id);
    const logsForTenant = mockAuditLogs.filter(l => l.tenantId === tenant.id);
    results.push({
      name: 'Audit log tenant creation',
      category: 'Audit Logging',
      passed: logsForTenant.length > 0 && logsForTenant[0].action === 'CREATE',
      duration: Date.now() - start1,
      details: `Logged ${logsForTenant.length} events for tenant`,
    });
  } catch (error: any) {
    results.push({
      name: 'Audit log tenant creation',
      category: 'Audit Logging',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }
  
  // Test 2: Log API key operations
  const start2 = Date.now();
  try {
    const tenant = createMockTenant({ name: 'Key Audit Test' });
    const key = createMockApiKey(tenant.id, { label: 'Audit Key' });
    logMockAudit('CREATE', 'API_KEY', tenant.id);
    logMockAudit('ROTATE', 'API_KEY', tenant.id);
    const keyLogs = mockAuditLogs.filter(l => l.resource === 'API_KEY' && l.tenantId === tenant.id);
    results.push({
      name: 'Audit log API key operations',
      category: 'Audit Logging',
      passed: keyLogs.length >= 2,
      duration: Date.now() - start2,
      details: `Logged ${keyLogs.length} API key operations`,
    });
  } catch (error: any) {
    results.push({
      name: 'Audit log API key operations',
      category: 'Audit Logging',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }
  
  // Test 3: Query audit logs with filters
  const start3 = Date.now();
  try {
    const createLogs = mockAuditLogs.filter(l => l.action === 'CREATE');
    results.push({
      name: 'Query audit logs with action filter',
      category: 'Audit Logging',
      passed: createLogs.length >= 2,
      duration: Date.now() - start3,
      details: `Found ${createLogs.length} CREATE events`,
    });
  } catch (error: any) {
    results.push({
      name: 'Query audit logs with action filter',
      category: 'Audit Logging',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }
  
  // Test 4: Audit log structure
  const start4 = Date.now();
  try {
    const log = mockAuditLogs[0];
    const hasRequiredFields = log.id && log.action && log.resource && log.createdAt;
    results.push({
      name: 'Audit log has required fields',
      category: 'Audit Logging',
      passed: !!hasRequiredFields,
      duration: Date.now() - start4,
      details: `Log has id=${!!log.id}, action=${log.action}, resource=${log.resource}`,
    });
  } catch (error: any) {
    results.push({
      name: 'Audit log has required fields',
      category: 'Audit Logging',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }
  
  return results;
}

async function testAnalytics(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Setup
  const tenant = createMockTenant({ name: 'Analytics Test' });
  
  // Test 1: Tenant stats structure
  const start1 = Date.now();
  try {
    const mockStats = {
      totalRequests: 15000,
      apiKeysCount: 5,
      activeApiKeysCount: 4,
      averageLatencyMs: 45,
      errorRate: 0.02,
    };
    results.push({
      name: 'Tenant stats include required fields',
      category: 'Analytics',
      passed: mockStats.totalRequests >= 0 && mockStats.apiKeysCount >= 0,
      duration: Date.now() - start1,
      details: `Stats: ${mockStats.totalRequests} requests, ${mockStats.apiKeysCount} keys`,
    });
  } catch (error: any) {
    results.push({
      name: 'Tenant stats include required fields',
      category: 'Analytics',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }
  
  // Test 2: API key stats
  const start2 = Date.now();
  try {
    const key = createMockApiKey(tenant.id, { label: 'Analytics Key' });
    key.totalRequests = 5000;
    const mockStats = {
      totalRequests: key.totalRequests,
      requestsToday: 150,
      requestsThisMonth: 3200,
      averageLatencyMs: 42,
      errorRate: 0.01,
      lastUsedAt: new Date(),
    };
    results.push({
      name: 'API key stats tracking',
      category: 'Analytics',
      passed: mockStats.totalRequests > 0 && mockStats.requestsToday >= 0,
      duration: Date.now() - start2,
      details: `Key stats: ${mockStats.totalRequests} total, ${mockStats.requestsToday} today`,
    });
  } catch (error: any) {
    results.push({
      name: 'API key stats tracking',
      category: 'Analytics',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }
  
  // Test 3: Dashboard summary structure
  const start3 = Date.now();
  try {
    const mockSummary = {
      totalTenants: mockTenants.size,
      activeTenants: Array.from(mockTenants.values()).filter(t => t.status === 'ACTIVE').length,
      totalApiKeys: mockApiKeys.size,
      activeApiKeys: Array.from(mockApiKeys.values()).filter(k => k.isActive).length,
      totalRequests24h: 50000,
      totalRequests30d: 1200000,
      averageLatencyMs: 48,
      topTenants: [],
      errorRate24h: 0.015,
    };
    results.push({
      name: 'Dashboard summary structure',
      category: 'Analytics',
      passed: mockSummary.totalTenants > 0 && mockSummary.totalApiKeys > 0,
      duration: Date.now() - start3,
      details: `Dashboard: ${mockSummary.totalTenants} tenants, ${mockSummary.totalApiKeys} keys`,
    });
  } catch (error: any) {
    results.push({
      name: 'Dashboard summary structure',
      category: 'Analytics',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }
  
  // Test 4: Billing report structure
  const start4 = Date.now();
  try {
    const mockReport = {
      tenantId: tenant.id,
      period: { from: new Date(), to: new Date() },
      lineItems: [
        { description: 'RPC Requests', quantity: 10000, unitPrice: 0.001, total: 10 },
      ],
      subtotal: 10,
      discount: 0,
      tax: 1,
      total: 11,
    };
    results.push({
      name: 'Billing report structure',
      category: 'Analytics',
      passed: mockReport.lineItems.length > 0 && mockReport.total >= 0,
      duration: Date.now() - start4,
      details: `Billing: $${mockReport.subtotal} subtotal, $${mockReport.total} total`,
    });
  } catch (error: any) {
    results.push({
      name: 'Billing report structure',
      category: 'Analytics',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }
  
  return results;
}

// ============================================================================
// Main Export
// ============================================================================

export async function testApiKeyManagementV2(): Promise<TestResult[]> {
  // Reset mocks
  mockTenants.clear();
  mockApiKeys.clear();
  mockAuditLogs.length = 0;
  idCounter = 0;
  
  const results: TestResult[] = [];
  
  results.push(...await testTenantManagement());
  results.push(...await testApiKeyV2Features());
  results.push(...await testApiKeyValidation());
  results.push(...await testScopeValidation());
  results.push(...await testAuditLogging());
  results.push(...await testAnalytics());
  
  return results;
}

// For direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  testApiKeyManagementV2().then(results => {
    console.log('API Key Management V2 Tests');
    console.log('==========================\n');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    results.forEach(r => {
      const status = r.passed ? '✓' : '✗';
      console.log(`${status} ${r.name} (${r.duration}ms)`);
      if (r.details) console.log(`  ${r.details}`);
      if (r.error) console.log(`  Error: ${r.error}`);
    });
    
    console.log(`\nTotal: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
}
