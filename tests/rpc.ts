import axios from 'axios';
import { TestConfig, TestResult } from '../types.js';

export async function testRPC(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test 1: RPC proxy with eth_blockNumber
  const start1 = Date.now();
  try {
    const response = await axios.post(
      `${config.serverUrl}/v1/rpc`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      },
      {
        headers: {
          'x-api-key': config.apiKey,
          'content-type': 'application/json',
        },
        timeout: config.requestTimeout,
      }
    );
    
    const passed = response.status === 200 && response.data?.result && typeof response.data.result === 'string';
    results.push({
      name: 'POST /v1/rpc - eth_blockNumber',
      category: 'RPC Proxy',
      passed,
      duration: Date.now() - start1,
      details: passed ? `Current block: ${parseInt(response.data.result, 16)}` : 'Invalid RPC response',
      suggestion: !passed ? 'Check UPSTREAM_RPC_URL configuration and network connectivity' : undefined,
    });
  } catch (error: any) {
    results.push({
      name: 'POST /v1/rpc - eth_blockNumber',
      category: 'RPC Proxy',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
      suggestion: error.response?.status === 401 || error.response?.status === 403
        ? 'Verify API key is valid and exists in database'
        : 'Check if upstream RPC URL is accessible',
    });
  }
  
  // Test 2: RPC proxy with eth_chainId
  const start2 = Date.now();
  try {
    const response = await axios.post(
      `${config.serverUrl}/v1/rpc`,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_chainId',
        params: [],
      },
      {
        headers: {
          'x-api-key': config.apiKey,
          'content-type': 'application/json',
        },
        timeout: config.requestTimeout,
      }
    );
    
    const passed = response.status === 200 && response.data?.result === '0x38'; // BSC mainnet = 56 = 0x38
    results.push({
      name: 'POST /v1/rpc - eth_chainId',
      category: 'RPC Proxy',
      passed,
      duration: Date.now() - start2,
      details: passed ? 'BSC mainnet chain ID verified (56)' : `Chain ID: ${response.data?.result}`,
      suggestion: !passed ? 'Verify UPSTREAM_RPC_URL points to BSC mainnet' : undefined,
    });
  } catch (error: any) {
    results.push({
      name: 'POST /v1/rpc - eth_chainId',
      category: 'RPC Proxy',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }
  
  return results;
}
