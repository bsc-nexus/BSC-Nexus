import { prisma as defaultPrisma, PrismaClientType } from '../db/prisma.js';
import { logger } from '../config/logger.js';

type UsageGroup = {
  apiKeyId: string;
  _count: { _all: number };
  _avg: { latencyMs: number | null };
};

type ErrorGroup = {
  apiKeyId: string;
  _count: { _all: number };
};

let prisma: PrismaClientType = defaultPrisma;

export function setPrismaClient(client: PrismaClientType): void {
  prisma = client;
}

export interface ApiUsageRecord {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method?: string | null;
  path?: string | null;
  statusCode: number;
  latencyMs: number;
  clientIp?: string | null;
  userAgent?: string | null;
  costEstimate?: number | null;
  timestamp: Date;
}

export interface UsageSummary {
  apiKeyId: string;
  totalRequests: number;
  averageLatencyMs: number | null;
  errorRate: number;
}

export interface RecentUsageQuery {
  limit?: number;
  apiKeyId?: string;
  since?: Date;
  statusCodeGte?: number;
}

export async function logApiUsage(entry: Omit<ApiUsageRecord, 'id'>): Promise<void> {
  try {
    await prisma.apiUsage.create({ 
      data: {
        apiKeyId: entry.apiKeyId,
        endpoint: entry.endpoint,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        latencyMs: entry.latencyMs,
        clientIp: entry.clientIp,
        userAgent: entry.userAgent,
        costEstimate: entry.costEstimate,
        timestamp: entry.timestamp,
      }
    });
  } catch (error) {
    logger.error('Failed to log API usage', { error });
  }
}

export interface UsageQuery {
  apiKeyId?: string;
  from?: Date;
  to?: Date;
}

export async function getUsageSummary(query: UsageQuery = {}): Promise<UsageSummary[]> {
  const where: any = {
    ...(query.apiKeyId ? { apiKeyId: query.apiKeyId } : {}),
    ...(query.from || query.to
      ? {
          timestamp: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const grouped = (await prisma.apiUsage.groupBy({
    by: ['apiKeyId'],
    where,
    _count: { _all: true },
    _avg: { latencyMs: true },
  })) as unknown as UsageGroup[];

  const errorCounts = (await prisma.apiUsage.groupBy({
    by: ['apiKeyId'],
    where: { ...where, statusCode: { gte: 400 } },
    _count: { _all: true },
  })) as unknown as ErrorGroup[];

  const errorLookup = new Map<string, number>();
  for (const group of errorCounts) {
    errorLookup.set(group.apiKeyId, group._count._all);
  }

  return grouped.map(group => {
    const total = group._count._all;
    const errors = errorLookup.get(group.apiKeyId) || 0;

    return {
      apiKeyId: group.apiKeyId,
      totalRequests: total,
      averageLatencyMs: group._avg.latencyMs,
      errorRate: total > 0 ? errors / total : 0,
    };
  });
}

export async function getRecentUsage(query: RecentUsageQuery = {}): Promise<ApiUsageRecord[]> {
  const where: any = {
    ...(query.apiKeyId ? { apiKeyId: query.apiKeyId } : {}),
    ...(query.since ? { timestamp: { gte: query.since } } : {}),
    ...(query.statusCodeGte ? { statusCode: { gte: query.statusCodeGte } } : {}),
  };

  const records = await prisma.apiUsage.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: query.limit ?? 50,
  });

  return records as ApiUsageRecord[];
}

export async function getRecentErrors(query: RecentUsageQuery = {}): Promise<ApiUsageRecord[]> {
  return getRecentUsage({
    ...query,
    statusCodeGte: Math.max(query.statusCodeGte ?? 400, 400),
  });
}

/**
 * Get usage statistics for a specific tenant
 */
export async function getTenantUsageSummary(tenantId: string, days = 30): Promise<{
  totalRequests: number;
  totalErrors: number;
  averageLatencyMs: number | null;
  topEndpoints: { endpoint: string; count: number }[];
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalAgg, errorAgg, latencyAgg, endpointStats] = await Promise.all([
    prisma.apiUsage.count({
      where: {
        apiKey: { tenantId },
        timestamp: { gte: since },
      },
    }),
    prisma.apiUsage.count({
      where: {
        apiKey: { tenantId },
        timestamp: { gte: since },
        statusCode: { gte: 400 },
      },
    }),
    prisma.apiUsage.aggregate({
      where: {
        apiKey: { tenantId },
        timestamp: { gte: since },
      },
      _avg: { latencyMs: true },
    }),
    prisma.apiUsage.groupBy({
      by: ['endpoint'],
      where: {
        apiKey: { tenantId },
        timestamp: { gte: since },
      },
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 5,
    }),
  ]);

  return {
    totalRequests: totalAgg,
    totalErrors: errorAgg,
    averageLatencyMs: latencyAgg._avg.latencyMs,
    topEndpoints: endpointStats.map((e: any) => ({
      endpoint: e.endpoint,
      count: e._count._all,
    })),
  };
}
