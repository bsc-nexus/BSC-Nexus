import { Router, Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { getMetrics } from '../services/metrics.js';
import { prisma } from '../db/prisma.js';
import { rpcProxyV2 } from '../services/rpcProxyV2.js';
import { rpcCacheService } from '../services/rpcCacheService.js';
import { circuitBreakerRegistry } from '../services/circuitBreaker.js';

const router = Router();

/**
 * GET /health - Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const databaseStatus = { connected: false as boolean, error: undefined as string | undefined };
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseStatus.connected = true;
    } catch (dbError: any) {
      databaseStatus.error = dbError.message;
    }

    const rpcEndpoints = rpcProxyV2.getEndpointHealth();
    const rpcHealthy = rpcEndpoints.some(ep => ep.healthy);
    const proxyStats = rpcProxyV2.getStats();

    const mevStatus = {
      enabled: config.mevProtectionEnabled,
      ready: config.mevProtectionEnabled && !!config.mevProtectionStrategy,
    };

    const overallOk = databaseStatus.connected && rpcHealthy;
    const health = {
      ok: overallOk,
      status: overallOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      config: {
        antiMevEnabled: config.antiMevEnabled,
        metricsEnabled: config.metricsEnabled,
        wsEnabled: config.wsEnabled,
        databaseConfigured: !!config.databaseUrl,
      },
      components: {
        database: databaseStatus,
        rpc: rpcEndpoints,
        mev: mevStatus,
        cache: {
          enabled: config.cacheEnabled,
          hitRate: Math.round(proxyStats.cacheStats.hitRate * 100) + '%',
          size: proxyStats.cacheStats.size,
        },
        circuitBreakers: proxyStats.circuitBreakers,
      },
    };
    
    logger.debug('Health check requested', { ip: req.ip });
    res.json(health);
  } catch (error: any) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      ok: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

/**
 * GET /metrics - Prometheus metrics endpoint
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    if (!config.metricsEnabled) {
      res.status(404).json({
        error: {
          code: 404,
          message: 'Metrics disabled',
        },
      });
      return;
    }
    
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error: any) {
    logger.error('Failed to generate metrics', { error: error.message });
    res.status(500).json({
      error: {
        code: 500,
        message: 'Failed to generate metrics',
      },
    });
  }
});

export default router;
