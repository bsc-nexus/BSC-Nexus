import crypto from 'crypto';
import { prisma as defaultPrisma, PrismaClientType } from '../db/prisma.js';
import { logger } from '../config/logger.js';
import { ApiKeyScope, AuditAction, AuditResource, TenantStatus, TenantTier } from '../types/enums.js';
import { logAuditEvent } from './auditLogService.js';
import { TIER_CONFIGS, checkTenantLimits } from './tenantService.js';

let prisma: PrismaClientType = defaultPrisma;

export function setPrismaClient(client: PrismaClientType): void {
  prisma = client;
}

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyRecord {
  id: string;
  key: string;
  keyPrefix: string; // First 8 chars for display
  label: string | null;
  tenantId: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  deactivatedReason: string | null;
  rateLimitPerMinute: number | null;
  rateLimitPerHour: number | null;
  rateLimitPerDay: number | null;
  scopes: ApiKeyScope[];
  allowedIps: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  totalRequests: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface CreateApiKeyParams {
  tenantId: string;
  label?: string;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  rateLimitPerDay?: number;
  scopes?: ApiKeyScope[];
  allowedIps?: string[];
  expiresAt?: Date;
  createdBy?: string;
}

export interface UpdateApiKeyParams {
  label?: string;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  rateLimitPerDay?: number;
  scopes?: ApiKeyScope[];
  allowedIps?: string[];
  expiresAt?: Date | null;
}

export interface ApiKeyListFilters {
  tenantId?: string;
  isActive?: boolean;
  label?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeExpired?: boolean;
}

export interface ApiKeyListResult {
  apiKeys: ApiKeyRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKeyRecord;
  error?: {
    code: string;
    message: string;
  };
}

export interface ApiKeyStats {
  totalRequests: number;
  requestsToday: number;
  requestsThisMonth: number;
  averageLatencyMs: number | null;
  errorRate: number;
  lastUsedAt: Date | null;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Generate a secure API key with prefix
 */
function generateApiKey(): { fullKey: string; prefix: string } {
  const fullKey = `bsc_${crypto.randomBytes(32).toString('hex')}`;
  const prefix = fullKey.substring(0, 12);
  return { fullKey, prefix };
}

/**
 * Create a new API key for a tenant
 */
export async function createApiKey(
  params: CreateApiKeyParams,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<{ apiKey: ApiKeyRecord; fullKey: string }> {
  // Validate tenant exists and is active
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    include: {
      _count: { select: { apiKeys: true } },
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${params.tenantId}`);
  }

  if (tenant.status !== TenantStatus.ACTIVE) {
    throw new Error(`Cannot create API key for ${tenant.status} tenant`);
  }

  // Check tenant's API key limit based on tier
  const tierConfig = TIER_CONFIGS[tenant.tier as TenantTier];
  if (tierConfig.maxApiKeys && tenant._count.apiKeys >= tierConfig.maxApiKeys) {
    throw new Error(
      `API key limit reached for tier ${tenant.tier}. Maximum ${tierConfig.maxApiKeys} keys allowed.`
    );
  }

  // Generate key
  const { fullKey, prefix } = generateApiKey();

  // Use tenant tier defaults if not specified
  const rateLimitPerMinute = params.rateLimitPerMinute ?? tierConfig.defaultRateLimitPerMinute;
  const rateLimitPerHour = params.rateLimitPerHour ?? tierConfig.defaultRateLimitPerHour;
  const rateLimitPerDay = params.rateLimitPerDay ?? tierConfig.defaultRateLimitPerDay;

  // Create the key
  const apiKey = await prisma.apiKey.create({
    data: {
      key: fullKey,
      keyPrefix: prefix,
      label: params.label,
      tenantId: params.tenantId,
      rateLimitPerMinute,
      rateLimitPerHour,
      rateLimitPerDay,
      scopes: params.scopes ?? [ApiKeyScope.RPC_READ],
      allowedIps: params.allowedIps ?? [],
      expiresAt: params.expiresAt,
      createdBy: params.createdBy,
    },
  });

  logger.info('API key created', {
    apiKeyId: apiKey.id,
    tenantId: params.tenantId,
    label: params.label,
    scopes: params.scopes,
  });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: params.tenantId,
      apiKeyId: apiKey.id,
      action: AuditAction.CREATE,
      resource: AuditResource.API_KEY,
      resourceId: apiKey.id,
      newValue: {
        label: params.label,
        scopes: params.scopes,
        expiresAt: params.expiresAt,
      },
      ipAddress: adminContext.ipAddress,
    });
  }

  return {
    apiKey: apiKey as ApiKeyRecord,
    fullKey,
  };
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(
  id: string,
  includeStats = false
): Promise<(ApiKeyRecord & { stats?: ApiKeyStats }) | null> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id },
  });

  if (!apiKey) return null;

  const result: ApiKeyRecord & { stats?: ApiKeyStats } = {
    ...apiKey,
    scopes: apiKey.scopes as ApiKeyScope[],
    allowedIps: apiKey.allowedIps as string[],
  } as ApiKeyRecord;

  if (includeStats) {
    result.stats = await getApiKeyStats(id);
  }

  return result;
}

/**
 * Get API key by value (for authentication)
 */
export async function getApiKeyByValue(keyValue: string): Promise<ApiKeyRecord | null> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { key: keyValue },
  });

  if (!apiKey) return null;

  return {
    ...apiKey,
    scopes: apiKey.scopes as ApiKeyScope[],
    allowedIps: apiKey.allowedIps as string[],
  } as ApiKeyRecord;
}

/**
 * Validate an API key for authentication
 */
export async function validateApiKey(
  keyValue: string,
  clientIp?: string
): Promise<ApiKeyValidationResult> {
  const apiKey = await getApiKeyByValue(keyValue);

  if (!apiKey) {
    return {
      valid: false,
      error: { code: 'INVALID_KEY', message: 'API key not found' },
    };
  }

  // Check if active
  if (!apiKey.isActive) {
    return {
      valid: false,
      apiKey,
      error: { code: 'KEY_INACTIVE', message: 'API key has been deactivated' },
    };
  }

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return {
      valid: false,
      apiKey,
      error: { code: 'KEY_EXPIRED', message: 'API key has expired' },
    };
  }

  // Check IP allowlist
  if (apiKey.allowedIps.length > 0 && clientIp) {
    if (!apiKey.allowedIps.includes(clientIp)) {
      return {
        valid: false,
        apiKey,
        error: { code: 'IP_NOT_ALLOWED', message: 'Client IP not in allowlist' },
      };
    }
  }

  // Check tenant status
  const tenant = await prisma.tenant.findUnique({
    where: { id: apiKey.tenantId },
    select: { status: true, maxRequestsPerDay: true },
  });

  if (!tenant) {
    return {
      valid: false,
      apiKey,
      error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
    };
  }

  if (tenant.status !== TenantStatus.ACTIVE) {
    return {
      valid: false,
      apiKey,
      error: { code: 'TENANT_INACTIVE', message: `Tenant is ${tenant.status}` },
    };
  }

  // Check tenant daily limits
  if (tenant.maxRequestsPerDay) {
    const limitCheck = await checkTenantLimits(apiKey.tenantId);
    if (!limitCheck.allowed) {
      return {
        valid: false,
        apiKey,
        error: { code: 'TENANT_LIMIT_EXCEEDED', message: limitCheck.reason ?? 'Tenant limit exceeded' },
      };
    }
  }

  return { valid: true, apiKey };
}

/**
 * List API keys with filters
 */
export async function listApiKeys(filters: ApiKeyListFilters = {}): Promise<ApiKeyListResult> {
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = filters.offset ?? 0;

  const where: any = {};

  if (filters.tenantId) {
    where.tenantId = filters.tenantId;
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.label) {
    where.label = { contains: filters.label, mode: 'insensitive' };
  }

  if (filters.search) {
    where.OR = [
      { label: { contains: filters.search, mode: 'insensitive' } },
      { keyPrefix: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Filter expired keys
  if (!filters.includeExpired) {
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ];
  }

  const [apiKeys, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.apiKey.count({ where }),
  ]);

  return {
    apiKeys: apiKeys.map((key: any) => ({
      ...key,
      scopes: key.scopes as ApiKeyScope[],
      allowedIps: key.allowedIps as string[],
    })) as ApiKeyRecord[],
    total,
    limit,
    offset,
  };
}

/**
 * Update API key properties
 */
export async function updateApiKey(
  id: string,
  params: UpdateApiKeyParams,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<ApiKeyRecord> {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`API key not found: ${id}`);
  }

  const updated = await prisma.apiKey.update({
    where: { id },
    data: {
      label: params.label,
      rateLimitPerMinute: params.rateLimitPerMinute,
      rateLimitPerHour: params.rateLimitPerHour,
      rateLimitPerDay: params.rateLimitPerDay,
      scopes: params.scopes,
      allowedIps: params.allowedIps,
      expiresAt: params.expiresAt,
      updatedAt: new Date(),
    },
  });

  logger.info('API key updated', {
    apiKeyId: id,
    tenantId: existing.tenantId,
    updates: Object.keys(params),
  });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: existing.tenantId,
      apiKeyId: id,
      action: AuditAction.UPDATE,
      resource: AuditResource.API_KEY,
      resourceId: id,
      previousValue: {
        label: existing.label,
        rateLimitPerMinute: existing.rateLimitPerMinute,
        rateLimitPerHour: existing.rateLimitPerHour,
        rateLimitPerDay: existing.rateLimitPerDay,
        scopes: existing.scopes,
        allowedIps: existing.allowedIps,
        expiresAt: existing.expiresAt,
      },
      newValue: params,
      ipAddress: adminContext.ipAddress,
    });
  }

  return {
    ...updated,
    scopes: updated.scopes as ApiKeyScope[],
    allowedIps: updated.allowedIps as string[],
  } as ApiKeyRecord;
}

/**
 * Deactivate an API key
 */
export async function deactivateApiKey(
  id: string,
  reason?: string,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<ApiKeyRecord> {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`API key not found: ${id}`);
  }

  if (!existing.isActive) {
    throw new Error('API key is already deactivated');
  }

  const updated = await prisma.apiKey.update({
    where: { id },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedReason: reason ?? 'Manual deactivation',
      updatedAt: new Date(),
    },
  });

  logger.info('API key deactivated', {
    apiKeyId: id,
    tenantId: existing.tenantId,
    reason,
  });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: existing.tenantId,
      apiKeyId: id,
      action: AuditAction.DEACTIVATE,
      resource: AuditResource.API_KEY,
      resourceId: id,
      previousValue: { isActive: true },
      newValue: { isActive: false, reason },
      ipAddress: adminContext.ipAddress,
    });
  }

  return {
    ...updated,
    scopes: updated.scopes as ApiKeyScope[],
    allowedIps: updated.allowedIps as string[],
  } as ApiKeyRecord;
}

/**
 * Activate (re-activate) an API key
 */
export async function activateApiKey(
  id: string,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<ApiKeyRecord> {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`API key not found: ${id}`);
  }

  if (existing.isActive) {
    throw new Error('API key is already active');
  }

  const updated = await prisma.apiKey.update({
    where: { id },
    data: {
      isActive: true,
      deactivatedAt: null,
      deactivatedReason: null,
      updatedAt: new Date(),
    },
  });

  logger.info('API key activated', {
    apiKeyId: id,
    tenantId: existing.tenantId,
  });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: existing.tenantId,
      apiKeyId: id,
      action: AuditAction.ACTIVATE,
      resource: AuditResource.API_KEY,
      resourceId: id,
      previousValue: { isActive: false },
      newValue: { isActive: true },
      ipAddress: adminContext.ipAddress,
    });
  }

  return {
    ...updated,
    scopes: updated.scopes as ApiKeyScope[],
    allowedIps: updated.allowedIps as string[],
  } as ApiKeyRecord;
}

/**
 * Rotate an API key (generate new key value)
 */
export async function rotateApiKey(
  id: string,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<{ apiKey: ApiKeyRecord; newKey: string }> {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`API key not found: ${id}`);
  }

  const { fullKey, prefix } = generateApiKey();

  const updated = await prisma.apiKey.update({
    where: { id },
    data: {
      key: fullKey,
      keyPrefix: prefix,
      updatedAt: new Date(),
    },
  });

  logger.info('API key rotated', {
    apiKeyId: id,
    tenantId: existing.tenantId,
  });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: existing.tenantId,
      apiKeyId: id,
      action: AuditAction.ROTATE,
      resource: AuditResource.API_KEY,
      resourceId: id,
      ipAddress: adminContext.ipAddress,
    });
  }

  return {
    apiKey: {
      ...updated,
      scopes: updated.scopes as ApiKeyScope[],
      allowedIps: updated.allowedIps as string[],
    } as ApiKeyRecord,
    newKey: fullKey,
  };
}

/**
 * Delete an API key permanently
 */
export async function deleteApiKey(
  id: string,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<void> {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`API key not found: ${id}`);
  }

  await prisma.apiKey.delete({ where: { id } });

  logger.info('API key deleted', {
    apiKeyId: id,
    tenantId: existing.tenantId,
  });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: existing.tenantId,
      apiKeyId: id,
      action: AuditAction.DELETE,
      resource: AuditResource.API_KEY,
      resourceId: id,
      previousValue: { label: existing.label, tenantId: existing.tenantId },
      ipAddress: adminContext.ipAddress,
    });
  }
}

// ============================================================================
// Statistics & Usage
// ============================================================================

/**
 * Update last used timestamp and increment total requests
 */
export async function trackApiKeyUsage(apiKeyId: string): Promise<void> {
  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: {
      lastUsedAt: new Date(),
      totalRequests: { increment: 1 },
    },
  });
}

/**
 * Get usage statistics for an API key
 */
export async function getApiKeyStats(apiKeyId: string): Promise<ApiKeyStats> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [apiKey, totalAgg, todayAgg, monthAgg] = await Promise.all([
    prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { lastUsedAt: true, totalRequests: true },
    }),
    prisma.apiUsage.aggregate({
      where: { apiKeyId },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    prisma.apiUsage.count({
      where: {
        apiKeyId,
        timestamp: { gte: startOfDay },
      },
    }),
    prisma.apiUsage.count({
      where: {
        apiKeyId,
        timestamp: { gte: startOfMonth },
      },
    }),
  ]);

  const errorCount = await prisma.apiUsage.count({
    where: {
      apiKeyId,
      statusCode: { gte: 400 },
    },
  });

  const totalRequests = totalAgg._count._all;

  return {
    totalRequests,
    requestsToday: todayAgg,
    requestsThisMonth: monthAgg,
    averageLatencyMs: totalAgg._avg.latencyMs,
    errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
    lastUsedAt: apiKey?.lastUsedAt ?? null,
  };
}

/**
 * Get all API keys that will expire soon
 */
export async function getExpiringApiKeys(daysThreshold = 7): Promise<ApiKeyRecord[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + daysThreshold);

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      isActive: true,
      expiresAt: {
        lte: threshold,
        gte: new Date(),
      },
    },
    orderBy: { expiresAt: 'asc' },
  });

  return apiKeys.map((key: any) => ({
    ...key,
    scopes: key.scopes as ApiKeyScope[],
    allowedIps: key.allowedIps as string[],
  })) as ApiKeyRecord[];
}

/**
 * Bulk deactivate expired API keys
 */
export async function deactivateExpiredKeys(): Promise<number> {
  const result = await prisma.apiKey.updateMany({
    where: {
      isActive: true,
      expiresAt: { lt: new Date() },
    },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedReason: 'Key expired',
    },
  });

  if (result.count > 0) {
    logger.info('Deactivated expired API keys', { count: result.count });
  }

  return result.count;
}

// ============================================================================
// Scope Validation
// ============================================================================

/**
 * Check if API key has required scope
 */
export function hasScope(apiKey: ApiKeyRecord, scope: ApiKeyScope): boolean {
  return apiKey.scopes.includes(scope);
}

/**
 * Check if API key has any of the required scopes
 */
export function hasAnyScope(apiKey: ApiKeyRecord, scopes: ApiKeyScope[]): boolean {
  return scopes.some(scope => apiKey.scopes.includes(scope));
}

/**
 * Check if API key has all required scopes
 */
export function hasAllScopes(apiKey: ApiKeyRecord, scopes: ApiKeyScope[]): boolean {
  return scopes.every(scope => apiKey.scopes.includes(scope));
}

/**
 * Get human-readable scope descriptions
 */
export function getScopeDescriptions(): Record<ApiKeyScope, string> {
  return {
    [ApiKeyScope.RPC_READ]: 'Read RPC data (eth_call, eth_getBalance, etc.)',
    [ApiKeyScope.RPC_WRITE]: 'Send transactions (eth_sendRawTransaction)',
    [ApiKeyScope.SWAP]: 'Execute swap transactions',
    [ApiKeyScope.ADMIN_READ]: 'Read admin data',
    [ApiKeyScope.ADMIN_WRITE]: 'Modify admin settings',
    [ApiKeyScope.MEV_PROTECTION]: 'Use MEV protection features',
    [ApiKeyScope.ANALYTICS]: 'Access analytics endpoints',
  };
}
