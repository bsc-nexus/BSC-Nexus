import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { logger } from '../config/logger.js';
import { checkAndConsume, getEffectiveLimitForApiKey, getDetailedRateLimitStatus } from '../services/rateLimitService.js';

function isRpcRequest(req: AuthenticatedRequest): boolean {
  return req.path.startsWith('/v1/rpc');
}

export function rateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.context?.apiKey;

  if (!apiKey) {
    next();
    return;
  }

  try {
    const limit = getEffectiveLimitForApiKey(apiKey);
    const result = checkAndConsume(apiKey.id, limit);

    req.context = { ...(req.context || {}), rateLimit: result };

    // Add rate limit headers to response
    const detailedStatus = getDetailedRateLimitStatus(apiKey.id, limit);
    res.setHeader('X-RateLimit-Limit-Minute', detailedStatus.minute.limit.toString());
    res.setHeader('X-RateLimit-Remaining-Minute', detailedStatus.minute.remaining.toString());
    res.setHeader('X-RateLimit-Reset-Minute', detailedStatus.minute.resetAt.toISOString());
    
    if (detailedStatus.hour.limit) {
      res.setHeader('X-RateLimit-Limit-Hour', detailedStatus.hour.limit.toString());
      res.setHeader('X-RateLimit-Remaining-Hour', detailedStatus.hour.remaining.toString());
    }
    
    if (detailedStatus.day.limit) {
      res.setHeader('X-RateLimit-Limit-Day', detailedStatus.day.limit.toString());
      res.setHeader('X-RateLimit-Remaining-Day', detailedStatus.day.remaining.toString());
    }

    if (!result.allowed) {
      logger.warn('Rate limit exceeded', {
        apiKeyId: apiKey.id,
        tenantId: apiKey.tenantId,
        limitType: result.limitType,
        currentCount: result.currentCount,
        remaining: result.remaining,
        resetAt: result.resetAt.toISOString(),
      });

      const errorMessage = result.limitType === 'day' 
        ? 'Daily rate limit exceeded'
        : result.limitType === 'hour'
        ? 'Hourly rate limit exceeded'
        : 'Rate limit exceeded';

      if (isRpcRequest(req)) {
        res.status(429).json({
          jsonrpc: '2.0',
          id: (req.body as any)?.id ?? null,
          error: {
            code: -32004,
            message: errorMessage,
          },
        });
        return;
      }

      res.status(429).json({
        error: {
          code: 429,
          message: errorMessage,
        },
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.error('Failed to evaluate rate limit', { error: error.message });
    res.status(500).json({
      error: {
        code: 500,
        message: 'Internal rate limit error',
      },
    });
  }
}
