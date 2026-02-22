import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { validateApiKey, ApiKeyRecord, hasScope } from '../services/apiKeyServiceV2.js';
import { RateLimitResult } from '../services/rateLimitService.js';
import { ApiKeyScope } from '../types/enums.js';

export interface RequestContext {
  apiKey?: ApiKeyRecord;
  rateLimit?: RateLimitResult;
}

export interface AuthenticatedRequest extends Request {
  context?: RequestContext;
}

/**
 * Middleware to require API key authentication (V2)
 */
export async function requireApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKeyValue = req.headers['x-api-key'] as string;
  const clientIp = req.ip ?? undefined;

  if (!apiKeyValue) {
    logger.warn('API request without key', {
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: 'API key required. Include x-api-key header.',
      },
    });
    return;
  }

  try {
    const validation = await validateApiKey(apiKeyValue, clientIp);

    if (!validation.valid) {
      const errorCode = validation.error?.code ?? 'INVALID_KEY';
      const errorMessage = validation.error?.message ?? 'Invalid API key';
      
      logger.warn('API key validation failed', {
        code: errorCode,
        message: errorMessage,
        path: req.path,
        ip: req.ip,
      });
      
      // Map error codes to appropriate status codes
      const statusCodeMap: Record<string, number> = {
        'INVALID_KEY': 403,
        'KEY_INACTIVE': 403,
        'KEY_EXPIRED': 403,
        'IP_NOT_ALLOWED': 403,
        'TENANT_NOT_FOUND': 403,
        'TENANT_INACTIVE': 403,
        'TENANT_LIMIT_EXCEEDED': 429,
      };
      
      res.status(statusCodeMap[errorCode] ?? 403).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32002,
          message: errorMessage,
        },
      });
      return;
    }

    req.context = { ...(req.context || {}), apiKey: validation.apiKey };

    logger.debug('API request authenticated', {
      keyId: validation.apiKey?.id,
      tenantId: validation.apiKey?.tenantId,
      path: req.path,
    });

    next();
  } catch (error: any) {
    logger.error('API key validation error', { error: error.message });
    res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal error validating API key',
      },
    });
  }
}

/**
 * Middleware factory to require specific scope(s)
 * @param scopes Required scope(s)
 */
export function requireScope(...scopes: ApiKeyScope[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const apiKey = req.context?.apiKey;
    
    if (!apiKey) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32001,
          message: 'API key required',
        },
      });
      return;
    }
    
    const missingScopes = scopes.filter(scope => !hasScope(apiKey, scope));
    
    if (missingScopes.length > 0) {
      logger.warn('API key missing required scope', {
        keyId: apiKey.id,
        missingScopes,
        path: req.path,
      });
      
      res.status(403).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32004,
          message: `Insufficient permissions. Missing scopes: ${missingScopes.join(', ')}`,
        },
      });
      return;
    }
    
    next();
  };
}

/**
 * Middleware to require admin token
 */
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const adminToken = req.headers['x-admin-token'] as string;

  if (!adminToken) {
    logger.warn('Admin request without token', { path: req.path, ip: req.ip });
    res.status(401).json({
      error: {
        code: 401,
        message: 'Admin token required. Include x-admin-token header.',
      },
    });
    return;
  }

  if (adminToken !== config.adminToken) {
    logger.warn('Invalid admin token used', { path: req.path });
    res.status(401).json({
      error: {
        code: 401,
        message: 'Invalid admin token',
      },
    });
    return;
  }

  logger.info('Admin request authenticated', { path: req.path });
  next();
}
