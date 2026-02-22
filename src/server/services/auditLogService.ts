import { prisma as defaultPrisma, PrismaClientType } from '../db/prisma.js';
import { logger } from '../config/logger.js';
import { AuditAction, AuditResource } from '../types/enums.js';

let prisma: PrismaClientType = defaultPrisma;

export function setPrismaClient(client: PrismaClientType): void {
  prisma = client;
}

// ============================================================================
// Types
// ============================================================================

export interface AuditLogRecord {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  tenantId: string | null;
  apiKeyId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  previousValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface LogAuditEventParams {
  adminId?: string;
  adminEmail?: string;
  tenantId?: string;
  apiKeyId?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilters {
  tenantId?: string;
  adminId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogListResult {
  logs: AuditLogRecord[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Log an audit event
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<AuditLogRecord> {
  try {
    const log = await prisma.auditLog.create({
      data: {
        adminId: params.adminId ?? null,
        adminEmail: params.adminEmail ?? null,
        tenantId: params.tenantId ?? null,
        apiKeyId: params.apiKeyId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        previousValue: params.previousValue ? JSON.parse(JSON.stringify(params.previousValue)) : null,
        newValue: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });

    logger.debug('Audit event logged', {
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      adminId: params.adminId,
      tenantId: params.tenantId,
    });

    return log as AuditLogRecord;
  } catch (error: any) {
    // Don't throw - audit logging should never break the main flow
    logger.error('Failed to log audit event', {
      error: error.message,
      action: params.action,
      resource: params.resource,
    });
    
    // Return a mock record so callers don't have to handle null
    return {
      id: 'error',
      adminId: params.adminId ?? null,
      adminEmail: params.adminEmail ?? null,
      tenantId: params.tenantId ?? null,
      apiKeyId: params.apiKeyId ?? null,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId ?? null,
      previousValue: params.previousValue ?? null,
      newValue: params.newValue ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      createdAt: new Date(),
    };
  }
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogListResult> {
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = filters.offset ?? 0;

  const where: any = {};

  if (filters.tenantId) {
    where.tenantId = filters.tenantId;
  }

  if (filters.adminId) {
    where.adminId = filters.adminId;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.resource) {
    where.resource = filters.resource;
  }

  if (filters.resourceId) {
    where.resourceId = filters.resourceId;
  }

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs: logs as AuditLogRecord[],
    total,
    limit,
    offset,
  };
}

/**
 * Get recent audit logs for a specific resource
 */
export async function getResourceAuditHistory(
  resource: AuditResource,
  resourceId: string,
  limit = 20
): Promise<AuditLogRecord[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      resource,
      resourceId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs as AuditLogRecord[];
}

/**
 * Get audit activity summary for a tenant
 */
export async function getTenantAuditSummary(tenantId: string, days = 30): Promise<{
  totalEvents: number;
  eventsByAction: Record<string, number>;
  eventsByResource: Record<string, number>;
  recentEvents: AuditLogRecord[];
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalEvents, byAction, byResource, recentEvents] = await Promise.all([
    prisma.auditLog.count({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      _count: { action: true },
    }),
    prisma.auditLog.groupBy({
      by: ['resource'],
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      _count: { resource: true },
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const eventsByAction: Record<string, number> = {};
  for (const group of byAction) {
    eventsByAction[group.action] = (group._count as any).action;
  }

  const eventsByResource: Record<string, number> = {};
  for (const group of byResource) {
    eventsByResource[group.resource] = (group._count as any).resource;
  }

  return {
    totalEvents,
    eventsByAction,
    eventsByResource,
    recentEvents: recentEvents as AuditLogRecord[],
  };
}

/**
 * Cleanup old audit logs
 */
export async function cleanupOldAuditLogs(retentionDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });

  logger.info('Audit log cleanup completed', {
    deleted: result.count,
    retentionDays,
    cutoff: cutoff.toISOString(),
  });

  return result.count;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format audit log for display
 */
export function formatAuditLog(log: AuditLogRecord): string {
  const timestamp = log.createdAt.toISOString();
  const admin = log.adminEmail ?? log.adminId ?? 'System';
  const action = log.action;
  const resource = `${log.resource}${log.resourceId ? `:${log.resourceId}` : ''}`;
  
  return `[${timestamp}] ${admin} performed ${action} on ${resource}`;
}

/**
 * Get human-readable description of audit action
 */
export function getActionDescription(action: AuditAction, resource: AuditResource): string {
  const actionDescriptions: Record<AuditAction, string> = {
    [AuditAction.CREATE]: 'Created',
    [AuditAction.UPDATE]: 'Updated',
    [AuditAction.DELETE]: 'Deleted',
    [AuditAction.ACTIVATE]: 'Activated',
    [AuditAction.DEACTIVATE]: 'Deactivated',
    [AuditAction.ROTATE]: 'Rotated',
    [AuditAction.VIEW]: 'Viewed',
    [AuditAction.EXPORT]: 'Exported',
  };

  const resourceDescriptions: Record<AuditResource, string> = {
    [AuditResource.TENANT]: 'tenant',
    [AuditResource.API_KEY]: 'API key',
    [AuditResource.USAGE_DATA]: 'usage data',
    [AuditResource.CONFIG]: 'configuration',
    [AuditResource.BILLING]: 'billing information',
  };

  return `${actionDescriptions[action]} ${resourceDescriptions[resource]}`;
}
