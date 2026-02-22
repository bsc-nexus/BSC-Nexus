import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Error handling request', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  
  // Check if response already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // For JSON-RPC endpoints, return JSON-RPC error format
  if (req.path.includes('/rpc') || req.path.includes('/v1/')) {
    const jsonRpcError: JsonRpcError = {
      jsonrpc: '2.0',
      id: (req.body as any)?.id ?? null,
      error: {
        code: -32603,
        message: 'Internal server error',
        data: process.env.NODE_ENV === 'development' ? err.message : undefined,
      },
    };
    
    res.status(500).json(jsonRpcError);
    return;
  }
  
  // For other endpoints, return standard error format
  res.status(500).json({
    error: {
      code: 500,
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
  });
}

/**
 * 404 handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', { path: req.path, method: req.method });
  
  res.status(404).json({
    error: {
      code: 404,
      message: 'Route not found',
      path: req.path,
    },
  });
}
