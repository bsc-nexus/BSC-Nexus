import axios from 'axios';
import { TestConfig, TestResult } from '../types.js';

export async function testGraphQL(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Test 1: GraphQL health query
  const start1 = Date.now();
  try {
    const response = await axios.post(
      `${config.serverUrl}/graphql`,
      {
        query: 'query { health }',
      },
      {
        headers: {
          'content-type': 'application/json',
        },
        timeout: config.requestTimeout,
      }
    );
    
    const passed = response.status === 200 && response.data?.data?.health === 'ok';
    results.push({
      name: 'GraphQL health query',
      category: 'GraphQL API',
      passed,
      duration: Date.now() - start1,
      details: passed ? 'GraphQL endpoint operational' : 'Invalid GraphQL response',
      suggestion: !passed ? 'Check Apollo Server configuration' : undefined,
    });
  } catch (error: any) {
    results.push({
      name: 'GraphQL health query',
      category: 'GraphQL API',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
      suggestion: 'Verify GraphQL endpoint is mounted and Apollo Server is running',
    });
  }
  
  // Test 2: GraphQL token query
  const start2 = Date.now();
  try {
    const response = await axios.post(
      `${config.serverUrl}/graphql`,
      {
        query: `query { token(address: "${config.busdTokenAddress}") { address symbol name decimals } }`,
      },
      {
        headers: {
          'content-type': 'application/json',
        },
        timeout: config.requestTimeout,
      }
    );
    
    const tokenData = response.data?.data?.token;
    const passed = response.status === 200 && 
                   tokenData?.symbol && 
                   tokenData?.address === config.busdTokenAddress.toLowerCase();
    
    results.push({
      name: 'GraphQL token query',
      category: 'GraphQL API',
      passed,
      duration: Date.now() - start2,
      details: passed 
        ? `Retrieved ${tokenData.symbol} via GraphQL` 
        : 'Token query failed',
      suggestion: !passed ? 'Check GraphQL resolvers and RPC connectivity' : undefined,
    });
  } catch (error: any) {
    results.push({
      name: 'GraphQL token query',
      category: 'GraphQL API',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
      suggestion: 'Verify token resolver is properly implemented',
    });
  }
  
  return results;
}
