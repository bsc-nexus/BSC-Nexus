import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import { AuditAction, AuditResource, ApiKeyScope, TenantTier, TenantStatus } from '../types/enums.js';

// V2 Services
import {
  createTenant,
  listTenants,
  getTenantById,
  updateTenant,
  suspendTenant,
  reactivateTenant,
  deleteTenant,
  getTenantStats,
  TIER_CONFIGS,
} from '../services/tenantService.js';

import {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  updateApiKey,
  deactivateApiKey,
  activateApiKey,
  rotateApiKey,
  deleteApiKey,
  getApiKeyStats,
  validateApiKey,
  getExpiringApiKeys,
  hasScope,
  getScopeDescriptions,
} from '../services/apiKeyServiceV2.js';

import { queryAuditLogs, getResourceAuditHistory, getTenantAuditSummary } from '../services/auditLogService.js';

import {
  getTenantAnalytics,
  getTenantTimeSeriesAnalytics,
  generateBillingReport,
  getDashboardSummary,
  exportUsageData,
  getApiKeyAnalytics,
  comparePeriods,
  TimeGranularity,
} from '../services/analyticsService.js';

import { logAuditEvent } from '../services/auditLogService.js';

const router = Router();

// ============================================================================
// Helper Functions
// ============================================================================

function getAdminContext(req: Request) {
  return {
    adminId: 'admin', // In a real system, extract from JWT
    adminEmail: 'admin@bsc-nexus.local',
    ipAddress: req.ip ?? undefined,
  };
}

function parseDate(dateStr: string | undefined, defaultValue: Date): Date {
  if (!dateStr) return defaultValue;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? defaultValue : date;
}

// ============================================================================
// Dashboard
// ============================================================================

/**
 * GET /admin/v2/dashboard - Get admin dashboard summary
 */
router.get('/dashboard', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const summary = await getDashboardSummary();
    
    logger.info('Admin V2: Dashboard viewed', { ip: req.ip });
    
    res.json({ success: true, data: summary });
  } catch (error: any) {
    logger.error('Failed to get dashboard summary', { error: error.message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

// ============================================================================
// Tenant Management
// ============================================================================

/**
 * GET /admin/v2/tenants - List all tenants with filters
 */
router.get('/tenants', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { status, tier, search, limit, offset } = req.query;
    
    const result = await listTenants({
      status: status as TenantStatus,
      tier: tier as TenantTier,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    
    logger.info('Admin V2: Listed tenants', { 
      count: result.tenants.length, 
      total: result.total,
      filters: { status, tier },
    });
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to list tenants', { error: error.message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * POST /admin/v2/tenants - Create a new tenant
 */
router.post('/tenants', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { name, description, email, billingEmail, tier, maxApiKeys, maxRequestsPerDay } = req.body;
    
    // Validation
    if (!name || typeof name !== 'string' || name.length < 2) {
      res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: 'Name is required (min 2 characters)' } 
      });
      return;
    }
    
    if (tier && !Object.values(TenantTier).includes(tier)) {
      res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: `Invalid tier. Valid: ${Object.values(TenantTier).join(', ')}` } 
      });
      return;
    }
    
    const tenant = await createTenant(
      { name, description, email, billingEmail, tier, maxApiKeys, maxRequestsPerDay },
      getAdminContext(req)
    );
    
    logger.info('Admin V2: Created tenant', { tenantId: tenant.id, name });
    
    res.status(201).json({ success: true, data: { tenant } });
  } catch (error: any) {
    logger.error('Failed to create tenant', { error: error.message });
    res.status(400).json({ success: false, error: { code: 'CREATE_FAILED', message: error.message } });
  }
});

/**
 * GET /admin/v2/tenants/:id - Get tenant details
 */
router.get('/tenants/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stats } = req.query;
    
    const tenant = await getTenantById(id, stats === 'true');
    
    if (!tenant) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }
    
    // Audit log for view
    await logAuditEvent({
      ...getAdminContext(req),
      tenantId: id,
      action: AuditAction.VIEW,
      resource: AuditResource.TENANT,
      resourceId: id,
    });
    
    res.json({ success: true, data: { tenant } });
  } catch (error: any) {
    logger.error('Failed to get tenant', { error: error.message, tenantId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * PATCH /admin/v2/tenants/:id - Update tenant
 */
router.put('/tenants/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, email, billingEmail, tier, maxApiKeys, maxRequestsPerDay } = req.body;
    
    if (tier && !Object.values(TenantTier).includes(tier)) {
      res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: `Invalid tier` } 
      });
      return;
    }
    
    const tenant = await updateTenant(
      id,
      { name, description, email, billingEmail, tier, maxApiKeys, maxRequestsPerDay },
      getAdminContext(req)
    );
    
    logger.info('Admin V2: Updated tenant', { tenantId: id });
    
    res.json({ success: true, data: { tenant } });
  } catch (error: any) {
    logger.error('Failed to update tenant', { error: error.message, tenantId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

/**
 * POST /admin/v2/tenants/:id/suspend - Suspend a tenant
 */
router.post('/tenants/:id/suspend', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const tenant = await suspendTenant(id, getAdminContext(req));
    
    logger.warn('Admin V2: Suspended tenant', { tenantId: id });
    
    res.json({ success: true, data: { tenant, message: 'Tenant suspended successfully' } });
  } catch (error: any) {
    logger.error('Failed to suspend tenant', { error: error.message, tenantId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'SUSPEND_FAILED', message: error.message } });
  }
});

/**
 * POST /admin/v2/tenants/:id/reactivate - Reactivate a suspended tenant
 */
router.post('/tenants/:id/reactivate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const tenant = await reactivateTenant(id, getAdminContext(req));
    
    logger.info('Admin V2: Reactivated tenant', { tenantId: id });
    
    res.json({ success: true, data: { tenant, message: 'Tenant reactivated successfully' } });
  } catch (error: any) {
    logger.error('Failed to reactivate tenant', { error: error.message, tenantId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'REACTIVATE_FAILED', message: error.message } });
  }
});

/**
 * DELETE /admin/v2/tenants/:id - Delete (soft) a tenant
 */
router.delete('/tenants/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await deleteTenant(id, getAdminContext(req));
    
    logger.warn('Admin V2: Deleted tenant', { tenantId: id });
    
    res.json({ success: true, data: { message: 'Tenant deleted successfully' } });
  } catch (error: any) {
    logger.error('Failed to delete tenant', { error: error.message, tenantId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

/**
 * GET /admin/v2/tenants/:id/stats - Get tenant usage statistics
 */
router.get('/tenants/:id/stats', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const stats = await getTenantStats(id);
    
    res.json({ success: true, data: { tenantId: id, stats } });
  } catch (error: any) {
    logger.error('Failed to get tenant stats', { error: error.message, tenantId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * GET /admin/v2/tenants/tiers - Get tier configurations
 */
router.get('/tenants/tiers', requireAdminToken, async (_req: Request, res: Response) => {
  res.json({ 
    success: true, 
    data: { 
      tiers: TIER_CONFIGS,
      descriptions: Object.fromEntries(
        Object.entries(TenantTier).map(([k, v]) => [v, k])
      ),
    } 
  });
});

// ============================================================================
// API Key Management
// ============================================================================

/**
 * GET /admin/v2/api-keys - List API keys with filters
 */
router.get('/api-keys', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { tenantId, isActive, search, limit, offset, includeExpired } = req.query;
    
    const result = await listApiKeys({
      tenantId: tenantId as string,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      includeExpired: includeExpired === 'true',
    });
    
    logger.info('Admin V2: Listed API keys', { 
      count: result.apiKeys.length, 
      total: result.total,
      filters: { tenantId, isActive },
    });
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to list API keys', { error: error.message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * POST /admin/v2/api-keys - Create new API key
 */
router.post('/api-keys', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { 
      tenantId, 
      label, 
      rateLimitPerMinute, 
      rateLimitPerHour, 
      rateLimitPerDay, 
      scopes, 
      allowedIps, 
      expiresAt 
    } = req.body;
    
    // Validation
    if (!tenantId || typeof tenantId !== 'string') {
      res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: 'tenantId is required' } 
      });
      return;
    }
    
    // Validate scopes
    if (scopes) {
      const invalidScopes = scopes.filter((s: string) => !Object.values(ApiKeyScope).includes(s as ApiKeyScope));
      if (invalidScopes.length > 0) {
        res.status(400).json({ 
          success: false, 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: `Invalid scopes: ${invalidScopes.join(', ')}. Valid: ${Object.values(ApiKeyScope).join(', ')}` 
          } 
        });
        return;
      }
    }
    
    // Validate IP addresses
    if (allowedIps && !Array.isArray(allowedIps)) {
      res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: 'allowedIps must be an array' } 
      });
      return;
    }
    
    const { apiKey, fullKey } = await createApiKey(
      {
        tenantId,
        label,
        rateLimitPerMinute,
        rateLimitPerHour,
        rateLimitPerDay,
        scopes: scopes as ApiKeyScope[],
        allowedIps,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        createdBy: getAdminContext(req).adminId,
      },
      getAdminContext(req)
    );
    
    logger.info('Admin V2: Created API key', { apiKeyId: apiKey.id, tenantId });
    
    // Return the full key only on creation
    res.status(201).json({ 
      success: true, 
      data: { 
        apiKey,
        fullKey, // Only shown once!
        message: 'Save this key - it will not be shown again',
      } 
    });
  } catch (error: any) {
    logger.error('Failed to create API key', { error: error.message });
    res.status(400).json({ success: false, error: { code: 'CREATE_FAILED', message: error.message } });
  }
});

/**
 * GET /admin/v2/api-keys/:id - Get API key details
 */
router.get('/api-keys/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stats } = req.query;
    
    const apiKey = await getApiKeyById(id, stats === 'true');
    
    if (!apiKey) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
      return;
    }
    
    res.json({ success: true, data: { apiKey } });
  } catch (error: any) {
    logger.error('Failed to get API key', { error: error.message, apiKeyId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * PATCH /admin/v2/api-keys/:id - Update API key
 */
router.put('/api-keys/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, rateLimitPerMinute, rateLimitPerHour, rateLimitPerDay, scopes, allowedIps, expiresAt } = req.body;
    
    // Validate scopes
    if (scopes) {
      const invalidScopes = scopes.filter((s: string) => !Object.values(ApiKeyScope).includes(s as ApiKeyScope));
      if (invalidScopes.length > 0) {
        res.status(400).json({ 
          success: false, 
          error: { code: 'VALIDATION_ERROR', message: `Invalid scopes: ${invalidScopes.join(', ')}` } 
        });
        return;
      }
    }
    
    const apiKey = await updateApiKey(
      id,
      { label, rateLimitPerMinute, rateLimitPerHour, rateLimitPerDay, scopes, allowedIps, expiresAt },
      getAdminContext(req)
    );
    
    logger.info('Admin V2: Updated API key', { apiKeyId: id });
    
    res.json({ success: true, data: { apiKey } });
  } catch (error: any) {
    logger.error('Failed to update API key', { error: error.message, apiKeyId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

/**
 * POST /admin/v2/api-keys/:id/deactivate - Deactivate API key
 */
router.post('/api-keys/:id/deactivate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const apiKey = await deactivateApiKey(id, reason, getAdminContext(req));
    
    logger.info('Admin V2: Deactivated API key', { apiKeyId: id });
    
    res.json({ success: true, data: { apiKey, message: 'API key deactivated' } });
  } catch (error: any) {
    logger.error('Failed to deactivate API key', { error: error.message, apiKeyId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'DEACTIVATE_FAILED', message: error.message } });
  }
});

/**
 * POST /admin/v2/api-keys/:id/activate - Activate API key
 */
router.post('/api-keys/:id/activate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const apiKey = await activateApiKey(id, getAdminContext(req));
    
    logger.info('Admin V2: Activated API key', { apiKeyId: id });
    
    res.json({ success: true, data: { apiKey, message: 'API key activated' } });
  } catch (error: any) {
    logger.error('Failed to activate API key', { error: error.message, apiKeyId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'ACTIVATE_FAILED', message: error.message } });
  }
});

/**
 * POST /admin/v2/api-keys/:id/rotate - Rotate API key
 */
router.post('/api-keys/:id/rotate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { apiKey, newKey } = await rotateApiKey(id, getAdminContext(req));
    
    logger.info('Admin V2: Rotated API key', { apiKeyId: id });
    
    res.json({ 
      success: true, 
      data: { 
        apiKey,
        newKey, // Only shown once!
        message: 'API key rotated successfully. Save the new key - it will not be shown again.',
      } 
    });
  } catch (error: any) {
    logger.error('Failed to rotate API key', { error: error.message, apiKeyId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'ROTATE_FAILED', message: error.message } });
  }
});

/**
 * DELETE /admin/v2/api-keys/:id - Delete API key permanently
 */
router.delete('/api-keys/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await deleteApiKey(id, getAdminContext(req));
    
    logger.warn('Admin V2: Deleted API key', { apiKeyId: id });
    
    res.json({ success: true, data: { message: 'API key deleted permanently' } });
  } catch (error: any) {
    logger.error('Failed to delete API key', { error: error.message, apiKeyId: req.params.id });
    res.status(400).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

/**
 * GET /admin/v2/api-keys/:id/stats - Get API key statistics
 */
router.get('/api-keys/:id/stats', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const stats = await getApiKeyStats(id);
    
    res.json({ success: true, data: { apiKeyId: id, stats } });
  } catch (error: any) {
    logger.error('Failed to get API key stats', { error: error.message, apiKeyId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * GET /admin/v2/api-keys/scopes - Get available scopes
 */
router.get('/api-keys/scopes', requireAdminToken, async (_req: Request, res: Response) => {
  res.json({ 
    success: true, 
    data: { 
      scopes: ApiKeyScope,
      descriptions: getScopeDescriptions(),
    } 
  });
});

/**
 * GET /admin/v2/api-keys/expiring - Get expiring API keys
 */
router.get('/api-keys/expiring', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { days } = req.query;
    const daysThreshold = days ? parseInt(days as string, 10) : 7;
    
    const apiKeys = await getExpiringApiKeys(daysThreshold);
    
    res.json({ success: true, data: { apiKeys, daysThreshold } });
  } catch (error: any) {
    logger.error('Failed to get expiring API keys', { error: error.message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

// ============================================================================
// Analytics & Reporting
// ============================================================================

/**
 * GET /admin/v2/analytics/tenants/:id - Get tenant analytics
 */
router.get('/analytics/tenants/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { from, to, granularity } = req.query;
    
    const now = new Date();
    const fromDate = parseDate(from as string, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const toDate = parseDate(to as string, now);
    
    const analytics = await getTenantAnalytics(id, fromDate, toDate);
    
    await logAuditEvent({
      ...getAdminContext(req),
      tenantId: id,
      action: AuditAction.VIEW,
      resource: AuditResource.USAGE_DATA,
      resourceId: id,
    });
    
    res.json({ success: true, data: analytics });
  } catch (error: any) {
    logger.error('Failed to get tenant analytics', { error: error.message, tenantId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * GET /admin/v2/analytics/api-keys/:id - Get API key analytics
 */
router.get('/analytics/api-keys/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    
    const now = new Date();
    const fromDate = parseDate(from as string, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const toDate = parseDate(to as string, now);
    
    const analytics = await getApiKeyAnalytics(id, fromDate, toDate);
    
    res.json({ success: true, data: analytics });
  } catch (error: any) {
    logger.error('Failed to get API key analytics', { error: error.message, apiKeyId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * GET /admin/v2/billing/tenants/:id - Generate billing report
 */
router.get('/billing/tenants/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    
    const now = new Date();
    const fromDate = parseDate(from as string, new Date(now.getFullYear(), now.getMonth(), 1));
    const toDate = parseDate(to as string, now);
    
    const report = await generateBillingReport(id, fromDate, toDate);
    
    await logAuditEvent({
      ...getAdminContext(req),
      tenantId: id,
      action: AuditAction.VIEW,
      resource: AuditResource.BILLING,
      resourceId: id,
    });
    
    res.json({ success: true, data: report });
  } catch (error: any) {
    logger.error('Failed to generate billing report', { error: error.message, tenantId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * GET /admin/v2/tenants/:id/export - Export usage data as CSV
 */
router.get('/tenants/:id/export', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    
    const now = new Date();
    const fromDate = parseDate(from as string, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const toDate = parseDate(to as string, now);
    
    const csv = await exportUsageData(id, fromDate, toDate);
    
    await logAuditEvent({
      ...getAdminContext(req),
      tenantId: id,
      action: AuditAction.EXPORT,
      resource: AuditResource.USAGE_DATA,
      resourceId: id,
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="usage-${id}-${fromDate.toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error: any) {
    logger.error('Failed to export usage data', { error: error.message, tenantId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: error.message } });
  }
});

// ============================================================================
// Audit Logs
// ============================================================================

/**
 * GET /admin/v2/audit-logs - Query audit logs
 */
router.get('/audit-logs', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { tenantId, adminId, action, resource, from, to, limit, offset } = req.query;
    
    const result = await queryAuditLogs({
      tenantId: tenantId as string,
      adminId: adminId as string,
      action: action as AuditAction,
      resource: resource as AuditResource,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to query audit logs', { error: error.message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * GET /admin/v2/audit-logs/tenants/:id - Get audit logs for a tenant
 */
router.get('/audit-logs/tenants/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { days } = req.query;
    
    const summary = await getTenantAuditSummary(id, days ? parseInt(days as string, 10) : 30);
    
    res.json({ success: true, data: { tenantId: id, ...summary } });
  } catch (error: any) {
    logger.error('Failed to get tenant audit summary', { error: error.message, tenantId: req.params.id });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

/**
 * GET /admin/v2/audit-logs/resources/:resource/:id - Get audit history for a resource
 */
router.get('/audit-logs/resources/:resource/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { resource, id } = req.params;
    const { limit } = req.query;
    
    if (!Object.values(AuditResource).includes(resource as AuditResource)) {
      res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: 'Invalid resource type' } 
      });
      return;
    }
    
    const logs = await getResourceAuditHistory(
      resource as AuditResource,
      id,
      limit ? parseInt(limit as string, 10) : 20
    );
    
    res.json({ success: true, data: { resource, resourceId: id, logs } });
  } catch (error: any) {
    logger.error('Failed to get resource audit history', { error: error.message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

// ============================================================================
// Validation & Testing
// ============================================================================

/**
 * POST /admin/v2/validate-key - Validate an API key
 */
router.post('/validate-key', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const { key, clientIp } = req.body;
    
    if (!key || typeof key !== 'string') {
      res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: 'key is required' } 
      });
      return;
    }
    
    const result = await validateApiKey(key, clientIp);
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to validate API key', { error: error.message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

export default router;
