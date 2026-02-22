import 'dotenv/config';
import { TestConfig } from './types.js';

export function loadConfig(): TestConfig {
  return {
    serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
    wsUrl: process.env.WS_URL || 'ws://localhost:3000',
    adminToken: process.env.ADMIN_TOKEN || 'admin',
    apiKey: process.env.API_KEY || 'dev-key-123',
    databaseUrl: process.env.DATABASE_URL,
    webhookTestUrl: process.env.WEBHOOK_TEST_URL || 'https://webhook.site/test',
    busdTokenAddress: process.env.BUSD_TOKEN_ADDRESS || '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '10000'),
    websocketTimeout: parseInt(process.env.WEBSOCKET_TIMEOUT || '5000'),
  };
}
