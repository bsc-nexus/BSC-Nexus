import axios from 'axios';
import { proxyRpcRequest, resetRpcEndpointPool } from '../src/server/services/rpcProxy.js';
import { TestResult } from './types.js';
import { mevProtectionService } from '../src/server/services/mevProtectionService.js';
import { config } from '../src/server/config/env.js';

const originalAxiosPost = axios.post;

export async function testRpcProxyRouting(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: fallback to secondary endpoint when primary fails
  resetRpcEndpointPool(['http://primary-rpc', 'http://secondary-rpc'], 25);
  const attempted: string[] = [];

  axios.post = async (url: string) => {
    attempted.push(url);
    if (url === 'http://primary-rpc') {
      throw new Error('primary offline');
    }
    return { data: { jsonrpc: '2.0', id: 1, result: 'ok-secondary' } } as any;
  };

  const fallbackResponse = await proxyRpcRequest(
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
    { timeout: 10 }
  );

  results.push({
    name: 'RPC proxy retries on failed primary endpoint',
    category: 'RPC Routing',
    passed: fallbackResponse.result === 'ok-secondary' && attempted.includes('http://secondary-rpc'),
    duration: 0,
    details: `Attempts: ${attempted.join(',')}`,
  });

  axios.post = originalAxiosPost;
  resetRpcEndpointPool();

  // Test 2: MEV protection invoked for transaction methods
  const originalProtection = mevProtectionService.protectTransaction;
  const originalMevEnabled = (config as any).mevProtectionEnabled;
  let mevInvoked = false;
  (config as any).mevProtectionEnabled = true;

  mevProtectionService.protectTransaction = async () => {
    mevInvoked = true;
    return {
      txHash: '0xmev',
      protection: { protected: true },
    } as any;
  };

  const mevResponse = await proxyRpcRequest(
    { jsonrpc: '2.0', id: 2, method: 'eth_sendRawTransaction', params: ['0x1234'] },
    { timeout: 10 }
  );

  results.push({
    name: 'MEV protection hooks transaction submissions',
    category: 'RPC Routing',
    passed: mevInvoked && mevResponse.result === '0xmev',
    duration: 0,
    details: 'MEV service intercepted eth_sendRawTransaction',
  });

  // Test 3: MEV can be skipped via disable flag
  mevInvoked = false;
  axios.post = async () => {
    return { data: { jsonrpc: '2.0', id: 3, result: 'no-mev' } } as any;
  };
  const skipResponse = await proxyRpcRequest(
    { jsonrpc: '2.0', id: 3, method: 'eth_sendRawTransaction', params: ['0x1234'] },
    { timeout: 10, disableAntiMev: true }
  );
  axios.post = originalAxiosPost;

  results.push({
    name: 'MEV protection can be skipped via flag',
    category: 'RPC Routing',
    passed: !mevInvoked && (!!skipResponse.result || skipResponse.error?.code === -32603),
    duration: 0,
    details: 'Skip flag bypassed MEV and executed normal routing',
  });

  mevProtectionService.protectTransaction = originalProtection;
  (config as any).mevProtectionEnabled = originalMevEnabled;

  return results;
}