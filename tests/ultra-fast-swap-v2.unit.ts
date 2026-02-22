import { TestResult } from './types.js';
import { ultraFastSwapV2, UltraFastSwapServiceV2 } from '../src/server/services/ultraFastSwapV2.js';

export async function testUltraFastSwapV2(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Service initialization
  const start1 = Date.now();
  try {
    const stats = ultraFastSwapV2.getStats();
    
    const passed = stats.supportedDexes >= 5;
    
    results.push({
      name: 'Ultra-Fast Swap v2 initializes correctly',
      category: 'Ultra-Fast Swap v2',
      passed,
      duration: Date.now() - start1,
      details: passed 
        ? `${stats.supportedDexes} DEXs supported` 
        : 'Insufficient DEX support',
    });
  } catch (error: any) {
    results.push({
      name: 'Ultra-Fast Swap v2 initializes correctly',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start1,
      error: error.message,
    });
  }

  // Test 2: Get swap quote (basic)
  const start2 = Date.now();
  try {
    const quote = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
      amountIn: '1000000000000000000', // 1 BNB
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    
    const passed = 
      quote.amountIn === '1000000000000000000' &&
      BigInt(quote.amountOut) > 0 &&
      BigInt(quote.amountOutMin) < BigInt(quote.amountOut) &&
      quote.bestRoute !== undefined &&
      quote.alternativeRoutes.length >= 0;
    
    results.push({
      name: 'Generates valid swap quote',
      category: 'Ultra-Fast Swap v2',
      passed,
      duration: Date.now() - start2,
      details: passed 
        ? `Best route: ${quote.bestRoute.router}, Output: ${quote.amountOut}` 
        : 'Invalid quote structure',
    });
  } catch (error: any) {
    results.push({
      name: 'Generates valid swap quote',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start2,
      error: error.message,
    });
  }

  // Test 3: Quote includes alternative routes
  const start3 = Date.now();
  try {
    const quote = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '1000000000000000000',
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    
    const hasAlternatives = quote.alternativeRoutes.length > 0;
    
    results.push({
      name: 'Quote includes alternative routes',
      category: 'Ultra-Fast Swap v2',
      passed: hasAlternatives,
      duration: Date.now() - start3,
      details: hasAlternatives 
        ? `${quote.alternativeRoutes.length} alternative routes found` 
        : 'No alternative routes',
    });
  } catch (error: any) {
    results.push({
      name: 'Quote includes alternative routes',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start3,
      error: error.message,
    });
  }

  // Test 4: Slippage protection (amountOutMin)
  const start4 = Date.now();
  try {
    const quote = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '1000000000000000000',
      slippageTolerance: 1.0, // 1%
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    
    // amountOutMin should be ~99% of amountOut for 1% slippage
    const amountOut = BigInt(quote.amountOut);
    const amountOutMin = BigInt(quote.amountOutMin);
    const minExpected = amountOut * BigInt(99) / BigInt(100); // 99%
    
    const passed = amountOutMin >= minExpected && amountOutMin < amountOut;
    
    results.push({
      name: 'Slippage protection calculates correct minimum output',
      category: 'Ultra-Fast Swap v2',
      passed,
      duration: Date.now() - start4,
      details: passed 
        ? `Output: ${amountOut}, Min: ${amountOutMin} (slippage: 1%)` 
        : 'Slippage calculation incorrect',
    });
  } catch (error: any) {
    results.push({
      name: 'Slippage protection calculates correct minimum output',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start4,
      error: error.message,
    });
  }

  // Test 5: Price impact warning
  const start5 = Date.now();
  try {
    const quote = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '10000000000000000000', // 10 BNB (larger amount = higher impact)
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    
    const hasPriceImpact = parseFloat(quote.priceImpact) > 0;
    const hasWarnings = quote.warnings.length > 0;
    
    results.push({
      name: 'Calculates price impact for large trades',
      category: 'Ultra-Fast Swap v2',
      passed: hasPriceImpact,
      duration: Date.now() - start5,
      details: hasPriceImpact 
        ? `Price impact: ${quote.priceImpact}%, Warnings: ${quote.warnings.length}` 
        : 'No price impact calculated',
    });
  } catch (error: any) {
    results.push({
      name: 'Calculates price impact for large trades',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start5,
      error: error.message,
    });
  }

  // Test 6: Route type detection (direct vs multi-hop)
  const start6 = Date.now();
  try {
    const quote = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '1000000000000000000',
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    
    const validRouteType = ['direct', 'multi-hop', 'split'].includes(quote.bestRoute.type);
    
    results.push({
      name: 'Best route has valid route type',
      category: 'Ultra-Fast Swap v2',
      passed: validRouteType,
      duration: Date.now() - start6,
      details: validRouteType 
        ? `Route type: ${quote.bestRoute.type}` 
        : 'Invalid route type',
    });
  } catch (error: any) {
    results.push({
      name: 'Best route has valid route type',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start6,
      error: error.message,
    });
  }

  // Test 7: Gas estimation
  const start7 = Date.now();
  try {
    const quote = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '1000000000000000000',
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    
    const hasGasEstimate = quote.bestRoute.gasEstimate > 0;
    const hasNetworkFees = parseFloat(quote.breakdown.networkFees) >= 0;
    
    results.push({
      name: 'Provides gas estimation',
      category: 'Ultra-Fast Swap v2',
      passed: hasGasEstimate && hasNetworkFees,
      duration: Date.now() - start7,
      details: hasGasEstimate 
        ? `Gas estimate: ${quote.bestRoute.gasEstimate}, Network fees: ${quote.breakdown.networkFees}` 
        : 'No gas estimate',
    });
  } catch (error: any) {
    results.push({
      name: 'Provides gas estimation',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start7,
      error: error.message,
    });
  }

  // Test 8: Quote expiration
  const start8 = Date.now();
  try {
    const quote = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '1000000000000000000',
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    
    const expiresInFuture = quote.expiresAt > Date.now();
    const expiresWithinDeadline = quote.expiresAt <= Date.now() + 21 * 60 * 1000; // 21 min max
    
    results.push({
      name: 'Quote has valid expiration time',
      category: 'Ultra-Fast Swap v2',
      passed: expiresInFuture && expiresWithinDeadline,
      duration: Date.now() - start8,
      details: expiresInFuture 
        ? `Expires at: ${new Date(quote.expiresAt).toISOString()}` 
        : 'Invalid expiration',
    });
  } catch (error: any) {
    results.push({
      name: 'Quote has valid expiration time',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start8,
      error: error.message,
    });
  }

  // Test 9: MEV protection flag
  const start9 = Date.now();
  try {
    const quoteWithMev = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '1000000000000000000',
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
      includeMevProtection: true,
    });
    
    const quoteWithoutMev = await ultraFastSwapV2.getQuote({
      tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      tokenOut: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      amountIn: '1000000000000000000',
      slippageTolerance: 0.5,
      deadlineMinutes: 20,
      recipient: '0x1234567890123456789012345678901234567890',
      includeMevProtection: false,
    });
    
    const passed = quoteWithMev.mevProtected === true && quoteWithoutMev.mevProtected === false;
    
    results.push({
      name: 'MEV protection flag is set correctly',
      category: 'Ultra-Fast Swap v2',
      passed,
      duration: Date.now() - start9,
      details: passed 
        ? `With MEV: ${quoteWithMev.mevProtected}, Without MEV: ${quoteWithoutMev.mevProtected}` 
        : 'MEV flag not set correctly',
    });
  } catch (error: any) {
    results.push({
      name: 'MEV protection flag is set correctly',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start9,
      error: error.message,
    });
  }

  // Test 10: Service handles disabled state
  const start10 = Date.now();
  try {
    const stats = ultraFastSwapV2.getStats();
    
    // Service should report status even if disabled
    const passed = typeof stats.enabled === 'boolean' && stats.supportedDexes > 0;
    
    results.push({
      name: 'Service reports correct status',
      category: 'Ultra-Fast Swap v2',
      passed,
      duration: Date.now() - start10,
      details: passed 
        ? `Enabled: ${stats.enabled}, DEXs: ${stats.supportedDexes}` 
        : 'Status reporting failed',
    });
  } catch (error: any) {
    results.push({
      name: 'Service reports correct status',
      category: 'Ultra-Fast Swap v2',
      passed: false,
      duration: Date.now() - start10,
      error: error.message,
    });
  }

  return results;
}
