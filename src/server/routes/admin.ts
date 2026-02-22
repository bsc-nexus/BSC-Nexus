import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import { 
  createApiKey, 
  listApiKeys, 
  deactivateApiKey, 
  getApiKeyById,
  activateApiKey,
  rotateApiKey,
  ApiKeyRecord,
} from '../services/apiKeyServiceV2.js';
import { 
  getUsageSummary, 
  getRecentUsage, 
  getRecentErrors,
  getTenantUsageSummary,
} from '../services/usageService.js';
import { 
  getEffectiveLimitForApiKey, 
  getUsageSnapshot,
  getDetailedRateLimitStatus,
} from '../services/rateLimitService.js';

const router = Router();

/**
 * GET /admin/api-keys - List all API keys (V2 Compatible)
 */
router.get('/api-keys', requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await listApiKeys({ limit: 100 });

    logger.info('Admin: Listed API keys', {
      count: result.apiKeys.length,
    });

    res.json({
      keys: result.apiKeys.map((k: ApiKeyRecord) => ({
        id: k.id,
        key: k.key,
        keyPrefix: k.keyPrefix,
        label: k.label,
        tenantId: k.tenantId,
        isActive: k.isActive,
        scopes: k.scopes,
        rateLimitPerMinute: k.rateLimitPerMinute,
        rateLimitPerHour: k.rateLimitPerHour,
        rateLimitPerDay: k.rateLimitPerDay,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        totalRequests: k.totalRequests,
        createdAt: k.createdAt,
      })),
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error: any) {
    logger.error('Failed to list API keys', { error: error.message });
    res.status(500).json({
      error: {
        code: 500,
        message: 'Failed to list API keys',
      },
    });
  }
});

/**
 * GET /admin/api-keys/:id - Get API key details (V2)
 */
router.get('/api-keys/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const apiKey = await getApiKeyById(id, true);

    if (!apiKey) {
      res.status(404).json({
        error: { code: 404, message: 'API key not found' },
      });
      return;
    }

    res.json({
      apiKey: {
        id: apiKey.id,
        key: apiKey.key,
        keyPrefix: apiKey.keyPrefix,
        label: apiKey.label,
        tenantId: apiKey.tenantId,
        isActive: apiKey.isActive,
        scopes: apiKey.scopes,
        allowedIps: apiKey.allowedIps,
        rateLimitPerMinute: apiKey.rateLimitPerMinute,
        rateLimitPerHour: apiKey.rateLimitPerHour,
        rateLimitPerDay: apiKey.rateLimitPerDay,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        totalRequests: apiKey.totalRequests,
        stats: apiKey.stats,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get API key', { error: error.message });
    res.status(500).json({
      error: { code: 500, message: 'Failed to get API key' },
    });
  }
});

/**
 * GET /admin/api-keys/:id/limits - Get API key limits with V2 multi-level support
 */
router.get('/api-keys/:id/limits', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({
        error: { code: 400, message: 'Key id parameter is required' },
      });
      return;
    }

    const apiKey = await getApiKeyById(id);

    if (!apiKey) {
      res.status(404).json({
        error: { code: 404, message: 'API key not found' },
      });
      return;
    }

    const limit = getEffectiveLimitForApiKey(apiKey);
    const snapshot = getUsageSnapshot(apiKey.id, limit);
    const detailed = getDetailedRateLimitStatus(apiKey.id, limit);

    res.json({
      apiKeyId: apiKey.id,
      limits: {
        perMinute: {
          max: detailed.minute.limit,
          used: detailed.minute.used,
          remaining: detailed.minute.remaining,
          resetAt: detailed.minute.resetAt.toISOString(),
        },
        perHour: detailed.hour.limit ? {
          max: detailed.hour.limit,
          used: detailed.hour.used,
          remaining: detailed.hour.remaining,
          resetAt: detailed.hour.resetAt?.toISOString(),
        } : null,
        perDay: detailed.day.limit ? {
          max: detailed.day.limit,
          used: detailed.day.used,
          remaining: detailed.day.remaining,
          resetAt: detailed.day.resetAt?.toISOString(),
        } : null,
        burstFactor: limit.burstFactor ?? 1,
      },
      usage: {
        allowed: snapshot.allowed,
        currentCount: snapshot.currentCount,
        remaining: snapshot.remaining,
        resetAt: snapshot.resetAt.toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch API key limit', { error: error.message });
    res.status(500).json({
      error: { code: 500, message: 'Failed to fetch API key limit information' },
    });
  }
});

/**
 * POST /admin/api-keys - Create new API key (V2)
 */
router.post('/api-keys', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { tenantId, label, rateLimitPerMinute, rateLimitPerHour, rateLimitPerDay, scopes, allowedIps, expiresAt } = req.body;

    // Validate tenantId
    if (!tenantId || typeof tenantId !== 'string') {
      res.status(400).json({
        error: {
          code: 400,
          message: 'Valid tenantId string is required',
        },
      });
      return;
    }

    // Validate label if provided
    if (label !== undefined && typeof label !== 'string') {
      res.status(400).json({
        error: {
          code: 400,
          message: 'Label must be a string',
        },
      });
      return;
    }

    const { apiKey, fullKey } = await createApiKey({
      tenantId,
      label: label || undefined,
      rateLimitPerMinute: rateLimitPerMinute || undefined,
      rateLimitPerHour: rateLimitPerHour || undefined,
      rateLimitPerDay: rateLimitPerDay || undefined,
      scopes: scopes || undefined,
      allowedIps: allowedIps || undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    logger.info('Admin: Created API key', { tenantId, label });

    res.status(201).json({
      apiKey: {
        id: apiKey.id,
        key: fullKey, // Only shown once
        keyPrefix: apiKey.keyPrefix,
        label: apiKey.label,
        tenantId: apiKey.tenantId,
        isActive: apiKey.isActive,
        scopes: apiKey.scopes,
        rateLimitPerMinute: apiKey.rateLimitPerMinute,
        rateLimitPerHour: apiKey.rateLimitPerHour,
        rateLimitPerDay: apiKey.rateLimitPerDay,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      message: 'Save this API key - it will not be shown again',
    });
  } catch (error: any) {
    logger.error('Failed to create API key', { error: error.message });
    res.status(400).json({
      error: {
        code: 400,
        message: error.message || 'Failed to create API key',
      },
    });
  }
});

/**
 * POST /admin/api-keys/:id/deactivate - Deactivate API key
 */
router.post('/api-keys/:id/deactivate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const apiKey = await deactivateApiKey(id, reason);

    logger.info('Admin: Deactivated API key', { id });

    res.json({ 
      success: true,
      apiKey: {
        id: apiKey.id,
        isActive: apiKey.isActive,
        deactivatedAt: apiKey.deactivatedAt,
        deactivatedReason: apiKey.deactivatedReason,
      },
    });
  } catch (error: any) {
    logger.error('Failed to deactivate API key', { error: error.message });
    res.status(400).json({
      error: {
        code: 400,
        message: error.message || 'Failed to deactivate API key',
      },
    });
  }
});

/**
 * POST /admin/api-keys/:id/activate - Activate API key
 */
router.post('/api-keys/:id/activate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const apiKey = await activateApiKey(id);

    logger.info('Admin: Activated API key', { id });

    res.json({ 
      success: true,
      apiKey: {
        id: apiKey.id,
        isActive: apiKey.isActive,
        deactivatedAt: apiKey.deactivatedAt,
        deactivatedReason: apiKey.deactivatedReason,
      },
    });
  } catch (error: any) {
    logger.error('Failed to activate API key', { error: error.message });
    res.status(400).json({
      error: {
        code: 400,
        message: error.message || 'Failed to activate API key',
      },
    });
  }
});

/**
 * POST /admin/api-keys/:id/rotate - Rotate API key
 */
router.post('/api-keys/:id/rotate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { apiKey, newKey } = await rotateApiKey(id);

    logger.info('Admin: Rotated API key', { id });

    res.json({ 
      success: true,
      apiKey: {
        id: apiKey.id,
        keyPrefix: apiKey.keyPrefix,
      },
      newKey, // Only shown once
      message: 'API key rotated successfully. Save the new key - it will not be shown again.',
    });
  } catch (error: any) {
    logger.error('Failed to rotate API key', { error: error.message });
    res.status(400).json({
      error: {
        code: 400,
        message: error.message || 'Failed to rotate API key',
      },
    });
  }
});

/**
 * GET /admin/usage - Usage summary endpoint
 */
router.get('/usage', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { apiKeyId, tenantId, from, to } = req.query;

    let summary;
    if (tenantId) {
      // Get tenant usage summary (V2)
      summary = await getTenantUsageSummary(
        tenantId as string,
        from && to 
          ? Math.ceil((new Date(to as string).getTime() - new Date(from as string).getTime()) / (1000 * 60 * 60 * 24))
          : 30
      );
    } else {
      summary = await getUsageSummary({
        apiKeyId: typeof apiKeyId === 'string' ? apiKeyId : undefined,
        from: typeof from === 'string' ? new Date(from) : undefined,
        to: typeof to === 'string' ? new Date(to) : undefined,
      });
    }

    res.json({ summary });
  } catch (error: any) {
    logger.error('Failed to fetch usage summary', { error: error.message });
    res.status(500).json({
      error: {
        code: 500,
        message: 'Failed to fetch usage summary',
      },
    });
  }
});

router.get('/usage/recent', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { apiKeyId, limit, since } = req.query;
    const parsedLimit =
      typeof limit === 'string'
        ? Math.min(Math.max(parseInt(limit, 10) || 0, 1), 500)
        : 50;
    const sinceDate = typeof since === 'string' ? new Date(since) : undefined;

    const records = await getRecentUsage({
      apiKeyId: typeof apiKeyId === 'string' ? apiKeyId : undefined,
      limit: parsedLimit,
      since: sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : undefined,
    });

    res.json({
      records,
      pagination: { limit: parsedLimit },
    });
  } catch (error: any) {
    logger.error('Failed to fetch recent usage', { error: error.message });
    res.status(500).json({
      error: { code: 500, message: 'Failed to fetch recent usage' },
    });
  }
});

router.get('/usage/errors', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { apiKeyId, limit, since } = req.query;
    const parsedLimit =
      typeof limit === 'string'
        ? Math.min(Math.max(parseInt(limit, 10) || 0, 1), 500)
        : 50;
    const sinceDate = typeof since === 'string' ? new Date(since) : undefined;

    const records = await getRecentErrors({
      apiKeyId: typeof apiKeyId === 'string' ? apiKeyId : undefined,
      limit: parsedLimit,
      since: sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : undefined,
    });

    res.json({
      records,
      pagination: { limit: parsedLimit },
    });
  } catch (error: any) {
    logger.error('Failed to fetch recent errors', { error: error.message });
    res.status(500).json({
      error: { code: 500, message: 'Failed to fetch error usage events' },
    });
  }
});

export default router;
