import { prisma as defaultPrisma, PrismaClientType } from '../db/prisma.js';
import { logger } from '../config/logger.js';
import { TenantTier, TenantStatus, AuditAction, AuditResource } from '../types/enums.js';
import { logAuditEvent } from './auditLogService.js';

let prisma: PrismaClientType = defaultPrisma;

export function setPrismaClient(client: PrismaClientType): void {
  prisma = client;
}

// ============================================================================
// Types
// ============================================================================

export interface TenantRecord {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  billingEmail: string | null;
  tier: TenantTier;
  status: TenantStatus;
  maxApiKeys: number | null;
  maxRequestsPerDay: number | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  _count?: {
    apiKeys: number;
  };
}

export interface CreateTenantParams {
  name: string;
  description?: string;
  email?: string;
  billingEmail?: string;
  tier?: TenantTier;
  maxApiKeys?: number;
  maxRequestsPerDay?: number;
}

export interface UpdateTenantParams {
  name?: string;
  description?: string;
  email?: string;
  billingEmail?: string;
  tier?: TenantTier;
  maxApiKeys?: number;
  maxRequestsPerDay?: number;
}

export interface TenantListFilters {
  status?: TenantStatus;
  tier?: TenantTier;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TenantListResult {
  tenants: TenantRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface TenantStats {
  totalRequests: number;
  apiKeysCount: number;
  activeApiKeysCount: number;
  averageLatencyMs: number | null;
  errorRate: number;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new tenant/organization
 */
export async function createTenant(
  params: CreateTenantParams,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<TenantRecord> {
  const tenant = await prisma.tenant.create({
    data: {
      name: params.name,
      description: params.description,
      email: params.email,
      billingEmail: params.billingEmail,
      tier: params.tier ?? TenantTier.FREE,
      maxApiKeys: params.maxApiKeys,
      maxRequestsPerDay: params.maxRequestsPerDay,
    },
  });

  logger.info('Tenant created', {
    tenantId: tenant.id,
    name: params.name,
    tier: params.tier ?? TenantTier.FREE,
  });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: tenant.id,
      action: AuditAction.CREATE,
      resource: AuditResource.TENANT,
      resourceId: tenant.id,
      newValue: params,
      ipAddress: adminContext.ipAddress,
    });
  }

  return tenant as TenantRecord;
}

/**
 * Get tenant by ID with optional API key counts
 */
export async function getTenantById(
  id: string,
  includeStats = false
): Promise<(TenantRecord & { stats?: TenantStats }) | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      _count: {
        select: { apiKeys: true },
      },
    },
  });

  if (!tenant) return null;

  const result: TenantRecord & { stats?: TenantStats } = {
    ...tenant,
    _count: { apiKeys: tenant._count.apiKeys },
  };

  if (includeStats) {
    result.stats = await getTenantStats(id);
  }

  return result;
}

/**
 * List tenants with filters and pagination
 */
export async function listTenants(filters: TenantListFilters = {}): Promise<TenantListResult> {
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = filters.offset ?? 0;

  const where: any = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.tier) {
    where.tier = filters.tier;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        _count: {
          select: { apiKeys: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    tenants: tenants as TenantRecord[],
    total,
    limit,
    offset,
  };
}

/**
 * Update tenant properties
 */
export async function updateTenant(
  id: string,
  params: UpdateTenantParams,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<TenantRecord> {
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Tenant not found: ${id}`);
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      ...params,
      updatedAt: new Date(),
    },
  });

  logger.info('Tenant updated', { tenantId: id, updates: Object.keys(params) });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: id,
      action: AuditAction.UPDATE,
      resource: AuditResource.TENANT,
      resourceId: id,
      previousValue: existing,
      newValue: params,
      ipAddress: adminContext.ipAddress,
    });
  }

  return updated as TenantRecord;
}

/**
 * Suspend a tenant (soft disable all API keys)
 */
export async function suspendTenant(
  id: string,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<TenantRecord> {
  const result = await prisma.$transaction(async (tx: any) => {
    // Update tenant status
    const tenant = await tx.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.SUSPENDED,
        updatedAt: new Date(),
      },
    });

    // Deactivate all active API keys
    await tx.apiKey.updateMany({
      where: { tenantId: id, isActive: true },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedReason: 'Tenant suspended',
      },
    });

    return tenant;
  });

  logger.warn('Tenant suspended', { tenantId: id });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: id,
      action: AuditAction.DEACTIVATE,
      resource: AuditResource.TENANT,
      resourceId: id,
      previousValue: { status: TenantStatus.ACTIVE },
      newValue: { status: TenantStatus.SUSPENDED },
      ipAddress: adminContext.ipAddress,
    });
  }

  return result as TenantRecord;
}

/**
 * Reactivate a suspended tenant
 */
export async function reactivateTenant(
  id: string,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<TenantRecord> {
  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      status: TenantStatus.ACTIVE,
      deactivatedAt: null,
      updatedAt: new Date(),
    },
  });

  logger.info('Tenant reactivated', { tenantId: id });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: id,
      action: AuditAction.ACTIVATE,
      resource: AuditResource.TENANT,
      resourceId: id,
      previousValue: { status: TenantStatus.SUSPENDED },
      newValue: { status: TenantStatus.ACTIVE },
      ipAddress: adminContext.ipAddress,
    });
  }

  return tenant as TenantRecord;
}

/**
 * Soft delete (deactivate) a tenant
 */
export async function deleteTenant(
  id: string,
  adminContext?: { adminId: string; adminEmail: string; ipAddress?: string }
): Promise<void> {
  await prisma.$transaction(async (tx: any) => {
    // Soft delete tenant
    await tx.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.DEACTIVATED,
        deactivatedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Deactivate all API keys
    await tx.apiKey.updateMany({
      where: { tenantId: id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedReason: 'Tenant deleted',
      },
    });
  });

  logger.warn('Tenant deleted', { tenantId: id });

  // Audit log
  if (adminContext) {
    await logAuditEvent({
      adminId: adminContext.adminId,
      adminEmail: adminContext.adminEmail,
      tenantId: id,
      action: AuditAction.DELETE,
      resource: AuditResource.TENANT,
      resourceId: id,
      ipAddress: adminContext.ipAddress,
    });
  }
}

// ============================================================================
// Statistics & Analytics
// ============================================================================

/**
 * Get usage statistics for a tenant
 */
export async function getTenantStats(tenantId: string): Promise<TenantStats> {
  const [apiKeysCount, activeApiKeysCount, usageAgg] = await Promise.all([
    prisma.apiKey.count({ where: { tenantId } }),
    prisma.apiKey.count({ where: { tenantId, isActive: true } }),
    prisma.apiUsage.aggregate({
      where: {
        apiKey: { tenantId },
        timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
  ]);

  const errorCount = await prisma.apiUsage.count({
    where: {
      apiKey: { tenantId },
      statusCode: { gte: 400 },
      timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const totalRequests = usageAgg._count._all;

  return {
    totalRequests,
    apiKeysCount,
    activeApiKeysCount,
    averageLatencyMs: usageAgg._avg.latencyMs,
    errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
  };
}

/**
 * Check if tenant has exceeded daily limits
 */
export async function checkTenantLimits(tenantId: string): Promise<{
  allowed: boolean;
  currentDailyUsage: number;
  maxRequestsPerDay: number | null;
  reason?: string;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { maxRequestsPerDay: true, status: true },
  });

  if (!tenant) {
    return { allowed: false, currentDailyUsage: 0, maxRequestsPerDay: null, reason: 'Tenant not found' };
  }

  if (tenant.status !== TenantStatus.ACTIVE) {
    return { allowed: false, currentDailyUsage: 0, maxRequestsPerDay: tenant.maxRequestsPerDay, reason: `Tenant is ${tenant.status}` };
  }

  if (!tenant.maxRequestsPerDay) {
    return { allowed: true, currentDailyUsage: 0, maxRequestsPerDay: null };
  }

  // Count today's usage
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const dailyUsage = await prisma.apiUsage.count({
    where: {
      apiKey: { tenantId },
      timestamp: { gte: startOfDay },
    },
  });

  const allowed = dailyUsage < tenant.maxRequestsPerDay;

  return {
    allowed,
    currentDailyUsage: dailyUsage,
    maxRequestsPerDay: tenant.maxRequestsPerDay,
    reason: allowed ? undefined : 'Daily request limit exceeded',
  };
}

// ============================================================================
// Tier Configuration
// ============================================================================

export interface TierConfig {
  name: string;
  maxApiKeys: number;
  defaultRateLimitPerMinute: number;
  defaultRateLimitPerHour: number | null;
  defaultRateLimitPerDay: number | null;
  features: string[];
}

export const TIER_CONFIGS: Record<TenantTier, TierConfig> = {
  [TenantTier.FREE]: {
    name: 'Free',
    maxApiKeys: 2,
    defaultRateLimitPerMinute: 60,
    defaultRateLimitPerHour: 1000,
    defaultRateLimitPerDay: 10000,
    features: ['RPC_READ', 'BASIC_ANALYTICS'],
  },
  [TenantTier.STARTER]: {
    name: 'Starter',
    maxApiKeys: 5,
    defaultRateLimitPerMinute: 300,
    defaultRateLimitPerHour: 10000,
    defaultRateLimitPerDay: 100000,
    features: ['RPC_READ', 'RPC_WRITE', 'SWAP', 'BASIC_ANALYTICS'],
  },
  [TenantTier.PROFESSIONAL]: {
    name: 'Professional',
    maxApiKeys: 20,
    defaultRateLimitPerMinute: 1000,
    defaultRateLimitPerHour: 50000,
    defaultRateLimitPerDay: 500000,
    features: ['RPC_READ', 'RPC_WRITE', 'SWAP', 'MEV_PROTECTION', 'ADVANCED_ANALYTICS'],
  },
  [TenantTier.ENTERPRISE]: {
    name: 'Enterprise',
    maxApiKeys: 100,
    defaultRateLimitPerMinute: 5000,
    defaultRateLimitPerHour: null,
    defaultRateLimitPerDay: null,
    features: ['RPC_READ', 'RPC_WRITE', 'SWAP', 'MEV_PROTECTION', 'ADMIN_READ', 'ADVANCED_ANALYTICS', 'DEDICATED_SUPPORT'],
  },
  [TenantTier.CUSTOM]: {
    name: 'Custom',
    maxApiKeys: 1000,
    defaultRateLimitPerMinute: 10000,
    defaultRateLimitPerHour: null,
    defaultRateLimitPerDay: null,
    features: ['ALL_FEATURES'],
  },
};

/**
 * Get tier configuration for a tenant
 */
export async function getTenantTierConfig(tenantId: string): Promise<TierConfig | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { tier: true },
  });

  if (!tenant) return null;

  return TIER_CONFIGS[tenant.tier as TenantTier];
}
