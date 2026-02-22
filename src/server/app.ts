import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { activeConnectionsGauge } from './services/metrics.js';

// Import routes
import healthRoutes from './routes/health.js';
import rpcRoutes from './routes/rpc.js';
import tokenRoutes from './routes/tokens.js';
import adminRoutes from './routes/admin.js';
import adminV2Routes from './routes/adminV2.js';

export function createApp(): Application {
  const app = express();
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Allow for development
  }));
  
  // CORS
  app.use(cors({
    origin: '*', // Configure this for production
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'x-admin-token', 'x-disable-anti-mev'],
  }));
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    message: {
      error: {
        code: 429,
        message: 'Too many requests, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  // Apply rate limiting to API endpoints only (not health/metrics)
  app.use('/v1/', limiter);
  app.use('/rpc', limiter);
  
  // Track active connections
  app.use((req, res, next) => {
    activeConnectionsGauge.inc();
    res.on('finish', () => {
      activeConnectionsGauge.dec();
    });
    next();
  });
  
  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
      });
    });
    
    next();
  });
  
  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'BSC Nexus',
      version: '2.0.0',
      description: 'Enterprise BSC RPC Infrastructure with Anti-MEV Protection',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        rpc: '/v1/rpc',
        tokens: '/v1/tokens/:address/info',
        admin: '/admin/*',
      },
      documentation: 'https://github.com/grkhmz23/BSC-Nexus',
    });
  });
  
  // Mount routes
  app.use(healthRoutes);
  app.use(rpcRoutes);
  app.use(tokenRoutes);
  app.use('/admin', adminRoutes); // Legacy API (V2 compatible)
  app.use('/admin/v2', adminV2Routes); // Full V2 API with all features
  
  // 404 handler
  app.use(notFoundHandler);
  
  // Error handler (must be last)
  app.use(errorHandler);
  
  return app;
}
