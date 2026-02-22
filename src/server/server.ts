import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';

async function startServer() {
  try {
    const app = createApp();
    
    const server = app.listen(config.port, () => {
      logger.info('🚀 BSC Nexus Server Started', {
        port: config.port,
        nodeEnv: config.nodeEnv,
        antiMevEnabled: config.antiMevEnabled,
        upstreamRpc: config.upstreamRpcUrl,
        metricsEnabled: config.metricsEnabled,
      });
      
      logger.info('Server ready to accept connections', {
        url: `http://localhost:${config.port}`,
        health: `http://localhost:${config.port}/health`,
        metrics: `http://localhost:${config.port}/metrics`,
        rpc: `http://localhost:${config.port}/v1/rpc`,
      });
      
      if (config.nodeEnv === 'development') {
        logger.info('Development mode - default API key available: dev-key-123');
      }
    });
    
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
      
      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error: any) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

startServer();
