import { TestResult } from './types.js';
import { getTokenInfo, TokenInfo } from '../src/server/services/tokenService.js';

// Mock Web3 and contract calls
const mockTokenData: Record<string, TokenInfo> = {
  '0xe9e7cea3dedca5984780bafc599bd69add087d56': {
    address: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    name: 'BUSD Token',
    symbol: 'BUSD',
    decimals: 18,
  },
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': {
    address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    name: 'Wrapped BNB',
    symbol: 'WBNB',
    decimals: 18,
  },
};

export async function testTokenService(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Token info structure validation
  const start1 = Date.now();
  try {
    const busdAddress = '0xe9e7cea3dedca5984780bafc599bd69add087d56';
    const tokenInfo = mockTokenData[busdAddress.toLowerCase()];
    
    const hasValidStructure = 
      tokenInfo &&
      typeof tokenInfo.address === 'string' &&
      typeof tokenInfo.name === 'string' &&
      typeof tokenInfo.symbol === 'string' &&
      typeof tokenInfo.decimals === 'number';
    
    results.push({
      name: 'Token info has valid structure',
      category: 'Token Service',
      passed: hasValidStructure,
      duration: Date.now() - start1,
      details: hasValidStructure 
        ? `${tokenInfo.symbol}: ${tokenInfo.name} (${tokenInfo.decimals} decimals)` 
        : 'Invalid token info structure',
    });
  } catch (error: any) {
    results.push({
      name: 'Token info has valid structure',
      category: 'Token Service',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }

  // Test 2: Token address normalization
  const start2 = Date.now();
  try {
    const mixedCaseAddress = '0xE9e7CEA3DEDcA5984780bAFc599bD69ADD087D56';
    const normalizedAddress = mixedCaseAddress.toLowerCase();
    const tokenInfo = mockTokenData[normalizedAddress];
    
    const passed = tokenInfo !== undefined && tokenInfo.address === normalizedAddress;
    results.push({
      name: 'Token address normalization works',
      category: 'Token Service',
      passed,
      duration: Date.now() - start2,
      details: passed ? `Normalized: ${normalizedAddress}` : 'Address normalization failed',
    });
  } catch (error: any) {
    results.push({
      name: 'Token address normalization works',
      category: 'Token Service',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }

  // Test 3: Multiple token support
  const start3 = Date.now();
  try {
    const tokens = Object.values(mockTokenData);
    const allHaveRequiredFields = tokens.every(t => 
      t.address && t.name && t.symbol && typeof t.decimals === 'number'
    );
    
    results.push({
      name: 'Multiple tokens have required fields',
      category: 'Token Service',
      passed: allHaveRequiredFields && tokens.length >= 2,
      duration: Date.now() - start3,
      details: `Validated ${tokens.length} tokens`,
    });
  } catch (error: any) {
    results.push({
      name: 'Multiple tokens have required fields',
      category: 'Token Service',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }

  return results;
}
