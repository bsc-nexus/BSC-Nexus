import axios from 'axios';
import { TestConfig, TestResult } from '../types.js';

export async function testTokens(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test: GET /v1/tokens/:address/info
  const start = Date.now();
  try {
    const response = await axios.get(
      `${config.serverUrl}/v1/tokens/${config.busdTokenAddress}/info`,
      {
        headers: {
          'x-api-key': config.apiKey,
        },
        timeout: config.requestTimeout,
      }
    );
    
    const passed = response.status === 200 && 
                   response.data?.symbol && 
                   response.data?.address === config.busdTokenAddress.toLowerCase();
    
    results.push({
      name: 'GET /v1/tokens/:address/info',
      category: 'Token API',
      passed,
      duration: Date.now() - start,
      details: passed 
        ? `Token: ${response.data.symbol} (${response.data.name}), Decimals: ${response.data.decimals}` 
        : 'Invalid token data',
      suggestion: !passed ? 'Verify token address is valid and contract exists on BSC' : undefined,
    });
  } catch (error: any) {
    results.push({
      name: 'GET /v1/tokens/:address/info',
      category: 'Token API',
      passed: false,
      duration: Date.now() - start,
      error: error.message,
      suggestion: error.response?.status === 401 || error.response?.status === 403
        ? 'Verify API key is valid'
        : 'Check if token contract exists and RPC is accessible',
    });
  }
  
  return results;
}
