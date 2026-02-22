import axios from 'axios';
import { TestConfig, TestResult } from './types.js';

interface TestEndpointOptions {
  url: string;
  name: string;
  config: TestConfig;
  headers?: Record<string, string>;
  expectedStatus: number | number[];
  successMessage: string;
  errorMessage: string;
  suggestion: string;
  method?: 'GET' | 'POST';
}

// Helper function with options object to avoid too many parameters
async function testEndpoint(options: TestEndpointOptions): Promise<TestResult> {
  const { url, name, config, headers = {}, expectedStatus, successMessage, errorMessage, suggestion, method = 'POST' } = options;
  const start = Date.now();
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  
  try {
    const response = method === 'POST' 
      ? await axios.post(
          url,
          { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
          {
            headers,
            timeout: config.requestTimeout,
            validateStatus: () => true,
          }
        )
      : await axios.get(url, {
          headers,
          timeout: config.requestTimeout,
          validateStatus: () => true,
        });
    
    const passed = expectedStatuses.includes(response.status);
    return {
      name,
      category: 'Security',
      passed,
      duration: Date.now() - start,
      details: passed ? successMessage : `Endpoint returned ${response.status}`,
      error: !passed ? errorMessage : undefined,
      suggestion: !passed ? suggestion : undefined,
    };
  } catch (error: any) {
    return {
      name,
      category: 'Security',
      passed: false,
      duration: Date.now() - start,
      error: error.message,
      suggestion: 'Check if server is running and accessible',
    };
  }
}

export async function testSecurity(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test 1: RPC endpoint requires API key
  results.push(
    await testEndpoint({
      url: `${config.serverUrl}/v1/rpc`,
      name: 'RPC endpoint requires API key',
      config,
      expectedStatus: [401, 403],
      successMessage: 'Correctly returns 401/403 without API key',
      errorMessage: 'Endpoint accessible without API key',
      suggestion: 'Add requireApiKey middleware to /v1/rpc endpoint',
    })
  );
  
  // Test 2: Invalid API key returns 403
  results.push(
    await testEndpoint({
      url: `${config.serverUrl}/v1/rpc`,
      name: 'Invalid API key returns 403',
      config,
      headers: { 'x-api-key': 'invalid-key-12345' },
      expectedStatus: 403,
      successMessage: 'Correctly rejects invalid API keys',
      errorMessage: 'Invalid API key accepted',
      suggestion: 'Verify API key validation logic',
    })
  );
  
  // Test 3: Admin endpoint requires admin token
  results.push(
    await testEndpoint({
      url: `${config.serverUrl}/admin/api-keys`,
      name: 'Admin endpoint requires admin token',
      config,
      method: 'GET',
      expectedStatus: 401,
      successMessage: 'Correctly requires admin token',
      errorMessage: 'Admin endpoint accessible without token',
      suggestion: 'Add admin token validation middleware',
    })
  );
  
  // Test 4: Invalid admin token returns 401
  results.push(
    await testEndpoint({
      url: `${config.serverUrl}/admin/api-keys`,
      name: 'Invalid admin token returns 401',
      config,
      method: 'GET',
      headers: { 'x-admin-token': 'invalid-token' },
      expectedStatus: 401,
      successMessage: 'Correctly rejects invalid admin tokens',
      errorMessage: 'Invalid admin token accepted',
      suggestion: 'Verify admin token validation',
    })
  );
  
  // Test 5: Health endpoint is public
  results.push(
    await testEndpoint({
      url: `${config.serverUrl}/health`,
      name: 'Health endpoint is public',
      config,
      method: 'GET',
      expectedStatus: 200,
      successMessage: 'Health endpoint correctly accessible without auth',
      errorMessage: 'Health endpoint requires auth',
      suggestion: 'Health endpoint should be public for monitoring',
    })
  );
  
  return results;
}