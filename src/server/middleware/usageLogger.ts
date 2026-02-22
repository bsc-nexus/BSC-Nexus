import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { logApiUsage } from '../services/usageService.js';
import { trackApiKeyUsage } from '../services/apiKeyServiceV2.js';
import { logger } from '../config/logger.js';

export function usageLogger(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const apiKeyId = req.context?.apiKey?.id;
    if (!apiKeyId) {
      return;
    }

    const latencyMs = Date.now() - start;
    const endpoint = req.route?.path || req.path;
    const method = typeof req.body === 'object' && (req.body as any)?.method ? (req.body as any).method : req.method;
    const clientIp = req.ip ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    // Log to usage table
    logApiUsage({
      apiKeyId,
      endpoint,
      method,
      statusCode: res.statusCode,
      latencyMs,
      clientIp,
      userAgent,
      timestamp: new Date(),
    }).catch(error => {
      logger.error('Failed to record API usage', { error });
    });

    // Update API key stats (V2)
    trackApiKeyUsage(apiKeyId).catch(error => {
      logger.error('Failed to update API key usage stats', { error });
    });
  });

  next();
}
