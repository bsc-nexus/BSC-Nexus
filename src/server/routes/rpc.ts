import { Router, Response } from 'express';
import { requireApiKey, AuthenticatedRequest } from '../middleware/auth.js';
import { proxyRpcRequest, validateJsonRpcRequest, JsonRpcResponse } from '../services/rpcProxy.js';
import { logger } from '../config/logger.js';
import { rpcRequestCounter, rpcRequestDuration } from '../services/metrics.js';

const router = Router();

router.post('/v1/rpc', requireApiKey, async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();

  try {
    const validation = validateJsonRpcRequest(req.body);

    if (!validation.valid) {
      logger.warn('Invalid JSON-RPC request', {
        error: validation.error,
        body: req.body,
      });

      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: validation.error,
        },
      };

      rpcRequestCounter.inc({ method: 'invalid', status: 'error' });
      res.status(400).json(errorResponse);
      return;
    }

    const rpcRequest = validation.request!;
    const disableAntiMev = req.headers['x-disable-anti-mev'] === 'true';

    logger.info('RPC request received', {
      method: rpcRequest.method,
      id: rpcRequest.id,
      apiKeyId: req.context?.apiKey?.id,
    });

    const response = await proxyRpcRequest(rpcRequest, {
      disableAntiMev,
    });

    const duration = (Date.now() - startTime) / 1000;
    rpcRequestDuration.observe({ method: rpcRequest.method }, duration);
    rpcRequestCounter.inc({
      method: rpcRequest.method,
      status: response.error ? 'error' : 'success',
    });

    logger.info('RPC request completed', {
      method: rpcRequest.method,
      id: rpcRequest.id,
      duration: `${duration.toFixed(3)}s`,
      hasError: !!response.error,
    });

    res.json(response);
  } catch (error: any) {
    logger.error('RPC request handler error', {
      error: error.message,
      stack: error.stack,
    });

    const errorResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: (req.body as any)?.id ?? null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message,
      },
    };

    rpcRequestCounter.inc({ method: 'unknown', status: 'error' });
    res.status(500).json(errorResponse);
  }
});

export default router;
