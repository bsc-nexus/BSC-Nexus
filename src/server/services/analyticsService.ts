import { prisma as defaultPrisma, PrismaClientType } from '../db/prisma.js';
import { logger } from '../config/logger.js';

let prisma: PrismaClientType = defaultPrisma;

export function setPrismaClient(client: PrismaClientType): void {
  prisma = client;
}

// ============================================================================
// Types
// ============================================================================

export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

export interface UsageTimeSeriesPoint {
  timestamp: Date;
  period: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  estimatedCost: number;
}

export interface EndpointUsageBreakdown {
  endpoint: string;
  totalRequests: number;
  averageLatencyMs: number;
  errorRate: number;
  estimatedCost: number;
}

export interface TenantAnalytics {
  tenantId: string;
  period: {
    from: Date;
    to: Date;
  };
  summary: {
    totalRequests: number;
    totalSuccessful: number;
    totalFailed: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    overallErrorRate: number;
    estimatedCost: number;
  };
  timeSeries: UsageTimeSeriesPoint[];
  topEndpoints: EndpointUsageBreakdown[];
  apiKeyUsage: {
    apiKeyId: string;
    label: string | null;
    totalRequests: number;
    percentageOfTotal: number;
  }[];
}

export interface BillingReport {
  tenantId: string;
  period: {
    from: Date;
    to: Date;
  };
  lineItems: BillingLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface BillingLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ApiKeyAnalytics {
  apiKeyId: string;
  period: {
    from: Date;
    to: Date;
  };
  summary: {
    totalRequests: number;
    averageLatencyMs: number;
    errorRate: number;
    uniqueEndpoints: number;
    estimatedCost: number;
  };
  hourlyBreakdown: {
    hour: string;
    requests: number;
    errors: number;
    avgLatencyMs: number;
  }[];
  topMethods: {
    method: string;
    count: number;
    percentage: number;
  }[];
}

export interface DashboardSummary {
  totalTenants: number;
  activeTenants: number;
  totalApiKeys: number;
  activeApiKeys: number;
  totalRequests24h: number;
  totalRequests30d: number;
  averageLatencyMs: number | null;
  topTenants: {
    tenantId: string;
    name: string;
    requests24h: number;
    percentageOfTotal: number;
  }[];
  errorRate24h: number;
}

// ============================================================================
// Pricing Configuration
// ============================================================================

// Cost per 1,000 requests by endpoint type
const PRICING_TIERS = {
  RPC_SIMPLE: 0.001,    // Simple RPC calls (eth_blockNumber, eth_chainId)
  RPC_STANDARD: 0.005,  // Standard RPC (eth_call, eth_getBalance)
  RPC_COMPLEX: 0.02,    // Complex RPC (trace_, debug_)
  SWAP: 0.05,           // Swap transactions
  MEV_PROTECTION: 0.10, // MEV protected transactions
};

// Endpoint categorization for pricing
const ENDPOINT_PRICING: Record<string, keyof typeof PRICING_TIERS> = {
  // Simple (cheap)
  'eth_blockNumber': 'RPC_SIMPLE',
  'eth_chainId': 'RPC_SIMPLE',
  'net_version': 'RPC_SIMPLE',
  'web3_clientVersion': 'RPC_SIMPLE',
  
  // Standard
  'eth_call': 'RPC_STANDARD',
  'eth_getBalance': 'RPC_STANDARD',
  'eth_getCode': 'RPC_STANDARD',
  'eth_getStorageAt': 'RPC_STANDARD',
  'eth_getTransactionCount': 'RPC_STANDARD',
  'eth_getBlockByNumber': 'RPC_STANDARD',
  'eth_getBlockByHash': 'RPC_STANDARD',
  'eth_getTransactionByHash': 'RPC_STANDARD',
  'eth_getTransactionReceipt': 'RPC_STANDARD',
  'eth_gasPrice': 'RPC_STANDARD',
  'eth_estimateGas': 'RPC_STANDARD',
  
  // Complex
  'trace_': 'RPC_COMPLEX',
  'debug_': 'RPC_COMPLEX',
  
  // Swaps
  'swap': 'SWAP',
  
  // MEV
  'mev_submit': 'MEV_PROTECTION',
};

function getEndpointPrice(endpoint: string): number {
  // Check exact match first
  if (ENDPOINT_PRICING[endpoint]) {
    return PRICING_TIERS[ENDPOINT_PRICING[endpoint]];
  }
  
  // Check prefix matches
  for (const [prefix, tier] of Object.entries(ENDPOINT_PRICING)) {
    if (endpoint.startsWith(prefix.replace('_', ''))) {
      return PRICING_TIERS[tier];
    }
  }
  
  // Default to standard
  return PRICING_TIERS.RPC_STANDARD;
}

// ============================================================================
// Analytics Functions
// ============================================================================

/**
 * Get time-series usage data for a tenant
 */
export async function getTenantTimeSeriesAnalytics(
  tenantId: string,
  from: Date,
  to: Date,
  granularity: TimeGranularity = 'day'
): Promise<UsageTimeSeriesPoint[]> {
  // Build time bucket expression based on granularity
  let timeBucket: string;
  let dateTrunc: string;
  
  switch (granularity) {
    case 'hour':
      dateTrunc = 'hour';
      break;
    case 'day':
      dateTrunc = 'day';
      break;
    case 'week':
      dateTrunc = 'week';
      break;
    case 'month':
      dateTrunc = 'month';
      break;
    default:
      dateTrunc = 'day';
  }

  // Use raw query for time bucketing
  const results = await prisma.$queryRaw<Array<{
    period: Date;
    total_requests: bigint;
    successful_requests: bigint;
    failed_requests: bigint;
    avg_latency: number | null;
    p95_latency: number | null;
    p99_latency: number | null;
  }>>`
    SELECT 
      date_trunc(${dateTrunc}, timestamp) as period,
      COUNT(*) as total_requests,
      COUNT(CASE WHEN status_code < 400 THEN 1 END) as successful_requests,
      COUNT(CASE WHEN status_code >= 400 THEN 1 END) as failed_requests,
      AVG(latency_ms)::float as avg_latency,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::float as p95_latency,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::float as p99_latency
    FROM api_usage
    WHERE api_key_id IN (
      SELECT id FROM api_keys WHERE tenant_id = ${tenantId}
    )
    AND timestamp >= ${from}
    AND timestamp <= ${to}
    GROUP BY date_trunc(${dateTrunc}, timestamp)
    ORDER BY period ASC
  `;

  return results.map((row: any) => {
    const total = Number(row.total_requests);
    const failed = Number(row.failed_requests);
    
    return {
      timestamp: row.period,
      period: row.period.toISOString(),
      totalRequests: total,
      successfulRequests: Number(row.successful_requests),
      failedRequests: failed,
      averageLatencyMs: Math.round(row.avg_latency ?? 0),
      p95LatencyMs: Math.round(row.p95_latency ?? 0),
      p99LatencyMs: Math.round(row.p99_latency ?? 0),
      errorRate: total > 0 ? failed / total : 0,
      estimatedCost: 0, // Will be calculated separately
    };
  });
}

/**
 * Get comprehensive tenant analytics
 */
export async function getTenantAnalytics(
  tenantId: string,
  from: Date,
  to: Date
): Promise<TenantAnalytics> {
  const [summary, timeSeries, topEndpoints, apiKeyUsage] = await Promise.all([
    // Summary stats
    prisma.apiUsage.aggregate({
      where: {
        apiKey: { tenantId },
        timestamp: { gte: from, lte: to },
      },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    // Time series
    getTenantTimeSeriesAnalytics(tenantId, from, to, 'day'),
    // Top endpoints
    prisma.apiUsage.groupBy({
      by: ['endpoint'],
      where: {
        apiKey: { tenantId },
        timestamp: { gte: from, lte: to },
      },
      _count: { _all: true },
      _avg: { latencyMs: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 10,
    }),
    // API key breakdown
    prisma.apiUsage.groupBy({
      by: ['apiKeyId'],
      where: {
        apiKey: { tenantId },
        timestamp: { gte: from, lte: to },
      },
      _count: { _all: true },
    }),
  ]);

  // Get API key labels
  const apiKeyIds = apiKeyUsage.map((u: any) => u.apiKeyId);
  const apiKeys = await prisma.apiKey.findMany({
    where: { id: { in: apiKeyIds } },
    select: { id: true, label: true },
  });
  const apiKeyLabels = new Map(apiKeys.map((k: any) => [k.id, k.label]));

  // Calculate error count and percentiles
  const errorCount = await prisma.apiUsage.count({
    where: {
      apiKey: { tenantId },
      timestamp: { gte: from, lte: to },
      statusCode: { gte: 400 },
    },
  });

  const totalRequests = summary._count._all;

  // Calculate estimated cost (simplified)
  const estimatedCost = totalRequests * 0.001; // $0.001 per request baseline

  return {
    tenantId,
    period: { from, to },
    summary: {
      totalRequests,
      totalSuccessful: totalRequests - errorCount,
      totalFailed: errorCount,
      averageLatencyMs: Math.round(summary._avg.latencyMs ?? 0),
      p95LatencyMs: 0, // Would need percentile calculation
      p99LatencyMs: 0,
      overallErrorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
      estimatedCost,
    },
    timeSeries,
    topEndpoints: topEndpoints.map((e: any) => ({
      endpoint: e.endpoint,
      totalRequests: (e._count as any)._all,
      averageLatencyMs: Math.round((e._avg as any).latencyMs ?? 0),
      errorRate: 0, // Would need per-endpoint error count
      estimatedCost: (e._count as any)._all * 0.001,
    })),
    apiKeyUsage: apiKeyUsage.map((u: any) => ({
      apiKeyId: u.apiKeyId,
      label: apiKeyLabels.get(u.apiKeyId) ?? null,
      totalRequests: (u._count as any)._all,
      percentageOfTotal: totalRequests > 0 ? (u._count as any)._all / totalRequests : 0,
    })),
  };
}

/**
 * Get analytics for a specific API key
 */
export async function getApiKeyAnalytics(
  apiKeyId: string,
  from: Date,
  to: Date
): Promise<ApiKeyAnalytics> {
  const [summary, hourlyData, methodData, apiKeyInfo] = await Promise.all([
    prisma.apiUsage.aggregate({
      where: {
        apiKeyId,
        timestamp: { gte: from, lte: to },
      },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    prisma.$queryRaw<Array<{
      hour: Date;
      requests: bigint;
      errors: bigint;
      avg_latency: number | null;
    }>>`
      SELECT 
        date_trunc('hour', timestamp) as hour,
        COUNT(*) as requests,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors,
        AVG(latency_ms)::float as avg_latency
      FROM api_usage
      WHERE api_key_id = ${apiKeyId}
      AND timestamp >= ${from}
      AND timestamp <= ${to}
      GROUP BY date_trunc('hour', timestamp)
      ORDER BY hour ASC
    `,
    prisma.apiUsage.groupBy({
      by: ['method'],
      where: {
        apiKeyId,
        timestamp: { gte: from, lte: to },
      },
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
    }),
    prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { id: true, label: true },
    }),
  ]);

  const totalRequests = summary._count._all;
  const errorCount = await prisma.apiUsage.count({
    where: {
      apiKeyId,
      timestamp: { gte: from, lte: to },
      statusCode: { gte: 400 },
    },
  });

  const uniqueEndpoints = await prisma.apiUsage.groupBy({
    by: ['endpoint'],
    where: {
      apiKeyId,
      timestamp: { gte: from, lte: to },
    },
  });

  return {
    apiKeyId,
    period: { from, to },
    summary: {
      totalRequests,
      averageLatencyMs: Math.round(summary._avg.latencyMs ?? 0),
      errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
      uniqueEndpoints: uniqueEndpoints.length,
      estimatedCost: totalRequests * 0.001,
    },
    hourlyBreakdown: hourlyData.map((h: any) => ({
      hour: h.hour.toISOString(),
      requests: Number(h.requests),
      errors: Number(h.errors),
      avgLatencyMs: Math.round(h.avg_latency ?? 0),
    })),
    topMethods: methodData.map((m: any) => ({
      method: m.method ?? 'unknown',
      count: (m._count as any)._all,
      percentage: totalRequests > 0 ? (m._count as any)._all / totalRequests : 0,
    })),
  };
}

/**
 * Generate a billing report for a tenant
 */
export async function generateBillingReport(
  tenantId: string,
  from: Date,
  to: Date
): Promise<BillingReport> {
  const analytics = await getTenantAnalytics(tenantId, from, to);

  const lineItems: BillingLineItem[] = [
    {
      description: 'RPC Requests',
      quantity: analytics.summary.totalRequests,
      unitPrice: 0.001,
      total: analytics.summary.estimatedCost,
    },
  ];

  // Add line items for specific features
  const mevUsage = await prisma.apiUsage.count({
    where: {
      apiKey: { tenantId },
      timestamp: { gte: from, lte: to },
      endpoint: { contains: 'mev' },
    },
  });

  if (mevUsage > 0) {
    const mevCost = mevUsage * 0.1;
    lineItems.push({
      description: 'MEV Protected Transactions',
      quantity: mevUsage,
      unitPrice: 0.1,
      total: mevCost,
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const discount = 0; // Could apply volume discounts
  const tax = subtotal * 0.1; // 10% tax example
  const total = subtotal - discount + tax;

  return {
    tenantId,
    period: { from, to },
    lineItems,
    subtotal,
    discount,
    tax,
    total,
  };
}

/**
 * Get admin dashboard summary
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalTenants,
    activeTenants,
    totalApiKeys,
    activeApiKeys,
    requests24h,
    requests30d,
    avgLatency,
    errors24h,
    topTenantsData,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.apiKey.count(),
    prisma.apiKey.count({ where: { isActive: true } }),
    prisma.apiUsage.count({ where: { timestamp: { gte: yesterday } } }),
    prisma.apiUsage.count({ where: { timestamp: { gte: thirtyDaysAgo } } }),
    prisma.apiUsage.aggregate({
      where: { timestamp: { gte: yesterday } },
      _avg: { latencyMs: true },
    }),
    prisma.apiUsage.count({
      where: { timestamp: { gte: yesterday }, statusCode: { gte: 400 } },
    }),
    prisma.apiUsage.groupBy({
      by: ['apiKeyId'],
      where: { timestamp: { gte: yesterday } },
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 5,
    }),
  ]);

  // Get tenant info for top tenants
  const apiKeyIds = topTenantsData.map((t: any) => t.apiKeyId);
  const apiKeys = await prisma.apiKey.findMany({
    where: { id: { in: apiKeyIds } },
    select: { id: true, tenantId: true },
  });

  const tenantIds = [...new Set((apiKeys as any[]).map((k: any) => k.tenantId))];
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true },
  });

  const tenantMap = new Map((tenants as any[]).map((t: any) => [t.id, t.name]));
  const apiKeyTenantMap = new Map((apiKeys as any[]).map((k: any) => [k.id, k.tenantId]));

  return {
    totalTenants,
    activeTenants,
    totalApiKeys,
    activeApiKeys,
    totalRequests24h: requests24h,
    totalRequests30d: requests30d,
    averageLatencyMs: Math.round(avgLatency._avg.latencyMs ?? 0),
    topTenants: topTenantsData.map((t: any) => {
      const tenantId = apiKeyTenantMap.get(t.apiKeyId) ?? 'unknown';
      return {
        tenantId,
        name: tenantMap.get(tenantId) ?? 'Unknown',
        requests24h: (t._count as any)._all,
        percentageOfTotal: requests24h > 0 ? (t._count as any)._all / requests24h : 0,
      };
    }),
    errorRate24h: requests24h > 0 ? errors24h / requests24h : 0,
  };
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export usage data as CSV
 */
export async function exportUsageData(
  tenantId: string,
  from: Date,
  to: Date
): Promise<string> {
  const usage = await prisma.apiUsage.findMany({
    where: {
      apiKey: { tenantId },
      timestamp: { gte: from, lte: to },
    },
    orderBy: { timestamp: 'desc' },
    include: {
      apiKey: {
        select: { label: true },
      },
    },
  });

  // CSV header
  const csvLines = [
    'timestamp,api_key_label,endpoint,method,status_code,latency_ms,client_ip,cost_estimate',
  ];

  // Data rows
  for (const record of usage) {
    csvLines.push(
      [
        record.timestamp.toISOString(),
        record.apiKey.label ?? 'unnamed',
        record.endpoint,
        record.method ?? '',
        record.statusCode,
        record.latencyMs,
        record.clientIp ?? '',
        record.costEstimate?.toString() ?? '0',
      ].join(',')
    );
  }

  return csvLines.join('\n');
}

/**
 * Get usage comparison between periods
 */
export async function comparePeriods(
  tenantId: string,
  currentFrom: Date,
  currentTo: Date,
  previousFrom: Date,
  previousTo: Date
): Promise<{
  current: TenantAnalytics;
  previous: TenantAnalytics;
  changes: {
    requestsChange: number; // Percentage
    latencyChange: number;
    errorRateChange: number;
    costChange: number;
  };
}> {
  const [current, previous] = await Promise.all([
    getTenantAnalytics(tenantId, currentFrom, currentTo),
    getTenantAnalytics(tenantId, previousFrom, previousTo),
  ]);

  const currentReqs = current.summary.totalRequests;
  const previousReqs = previous.summary.totalRequests;

  return {
    current,
    previous,
    changes: {
      requestsChange: previousReqs > 0 ? (currentReqs - previousReqs) / previousReqs : 0,
      latencyChange: previous.summary.averageLatencyMs > 0
        ? (current.summary.averageLatencyMs - previous.summary.averageLatencyMs) / previous.summary.averageLatencyMs
        : 0,
      errorRateChange: previous.summary.overallErrorRate > 0
        ? (current.summary.overallErrorRate - previous.summary.overallErrorRate) / previous.summary.overallErrorRate
        : 0,
      costChange: previous.summary.estimatedCost > 0
        ? (current.summary.estimatedCost - previous.summary.estimatedCost) / previous.summary.estimatedCost
        : 0,
    },
  };
}
