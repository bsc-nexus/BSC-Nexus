import axios from 'axios';
import { TestConfig, TestResult } from '../types.js';

export async function testHealth(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test 1: GET /health
  const start1 = Date.now();
  try {
    const response = await axios.get(`${config.serverUrl}/health`, {
      timeout: config.requestTimeout,
    });
    
    const passed = response.status === 200 && response.data?.ok === true;
    const hasComponents = !!response.data?.components;
    results.push({
      name: 'GET /health endpoint',
      category: 'Health Checks',
      passed,
      duration: Date.now() - start1,
      details: passed
        ? hasComponents
          ? 'Health check returned component statuses'
          : 'Health check returned { ok: true }'
        : `Unexpected response: ${JSON.stringify(response.data)}`,
      suggestion: !passed ? 'Ensure database connection is active and server is running' : undefined,
    });
  } catch (error: any) {
    results.push({
      name: 'GET /health endpoint',
      category: 'Health Checks',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
      suggestion: 'Check if BSC Nexus server is running on ' + config.serverUrl,
    });
  }
  
  // Test 2: GET /metrics
  const start2 = Date.now();
  try {
    const response = await axios.get(`${config.serverUrl}/metrics`, {
      timeout: config.requestTimeout,
    });
    
    const passed = response.status === 200 && typeof response.data === 'string' && response.data.includes('# HELP');
    results.push({
      name: 'GET /metrics endpoint',
      category: 'Health Checks',
      passed,
      duration: Date.now() - start2,
      details: passed ? 'Prometheus metrics returned successfully' : 'Invalid metrics format',
      suggestion: !passed ? 'Verify prom-client is properly configured' : undefined,
    });
  } catch (error: any) {
    results.push({
      name: 'GET /metrics endpoint',
      category: 'Health Checks',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
      suggestion: 'Check if /metrics route is properly configured',
    });
  }
  
  return results;
}
