import { TestResult } from './types.js';
import { getMetrics } from '../src/server/services/metrics.js';

// Mock the metrics service to test health check logic
export async function testHealthService(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Metrics service returns proper Prometheus format
  const start1 = Date.now();
  try {
    const metrics = await getMetrics();
    const passed = typeof metrics === 'string' && metrics.includes('# HELP');
    
    results.push({
      name: 'Metrics service returns Prometheus format',
      category: 'Health Service',
      passed,
      duration: Date.now() - start1,
      details: passed ? 'Prometheus metrics generated successfully' : 'Invalid metrics format',
    });
  } catch (error: any) {
    results.push({
      name: 'Metrics service returns Prometheus format',
      category: 'Health Service',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
      details: 'Failed to generate metrics',
    });
  }

  // Test 2: Health check components exist
  const start2 = Date.now();
  try {
    const { config } = await import('../src/server/config/env.js');
    const hasRequiredConfig = 
      typeof config.port === 'number' &&
      typeof config.nodeEnv === 'string' &&
      typeof config.mevProtectionEnabled === 'boolean';
    
    results.push({
      name: 'Health check configuration is valid',
      category: 'Health Service',
      passed: hasRequiredConfig,
      duration: Date.now() - start2,
      details: hasRequiredConfig 
        ? `Port: ${config.port}, Env: ${config.nodeEnv}, MEV: ${config.mevProtectionEnabled}` 
        : 'Missing required configuration',
    });
  } catch (error: any) {
    results.push({
      name: 'Health check configuration is valid',
      category: 'Health Service',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }

  return results;
}
