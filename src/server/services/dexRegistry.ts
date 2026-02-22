/**
 * BNB Chain DEX Registry
 * 
 * Comprehensive registry of all DEXs on BNB Chain (BSC) for MEV detection.
 * Updated: 2026-02-19
 */

export interface DexInfo {
  name: string;
  routerAddress: string;
  version: string;
  functionSignatures: string[];
  riskLevel: 'low' | 'medium' | 'high'; // Higher = more sandwich attacks
  marketShare: string; // Approximate market share on BSC
}

/**
 * All known BSC DEX router addresses and function signatures
 */
export const BSC_DEX_REGISTRY: DexInfo[] = [
  // ============================================================================
  // PancakeSwap - Market Leader (60%+ market share)
  // ============================================================================
  {
    name: 'PancakeSwap V2',
    routerAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0xb6f9de95', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
      '0xfb3bdb41', // swapETHForExactTokens
    ],
    riskLevel: 'high',
    marketShare: '60%',
  },
  {
    name: 'PancakeSwap V3',
    routerAddress: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
    version: 'V3',
    functionSignatures: [
      '0x128acb08', // exactInputSingle
      '0xc04b8d59', // exactInput
      '0x04e45aaf', // exactOutputSingle
      '0x5023b4df', // exactOutput
      '0x3593564c', // multicall
      '0xac9650d8', // multicall (variant)
      '0x5ae401dc', // multicall (batch)
    ],
    riskLevel: 'high',
    marketShare: '15%',
  },
  {
    name: 'PancakeSwap Universal Router',
    routerAddress: '0x4Dae2f939AC504796445db8d5F8e736F7E95C1F2',
    version: 'Universal',
    functionSignatures: [
      '0x24856bc3', // execute
      '0x3593564c', // multicall
    ],
    riskLevel: 'high',
    marketShare: '5%',
  },

  // ============================================================================
  // BiSwap - Major Competitor (5-8% market share)
  // ============================================================================
  {
    name: 'BiSwap',
    routerAddress: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0xb6f9de95', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
      '0x5c11d795', // swapExactTokensForTokensSupportingFeeOnTransferTokens (BiSwap variant)
    ],
    riskLevel: 'high',
    marketShare: '7%',
  },

  // ============================================================================
  // ApeSwap - Established DEX (3-5% market share)
  // ============================================================================
  {
    name: 'ApeSwap',
    routerAddress: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0xb6f9de95', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
    ],
    riskLevel: 'high',
    marketShare: '4%',
  },

  // ============================================================================
  // MDEX - Multi-chain DEX (2-4% market share)
  // ============================================================================
  {
    name: 'MDEX',
    routerAddress: '0x7DAe51BD3E3376B0c54985d8C1669d67f5fE3A27',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0xb6f9de95', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
    ],
    riskLevel: 'medium',
    marketShare: '3%',
  },

  // ============================================================================
  // BabySwap - Meme-focused DEX (1-2% market share)
  // ============================================================================
  {
    name: 'BabySwap',
    routerAddress: '0x325E343f1dE602396E256B67eFd1F61C3A6B38Bd',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0xb6f9de95', // swapExactTokensForTokensSupportingFeeOnTransferTokens
    ],
    riskLevel: 'high',
    marketShare: '1.5%',
  },

  // ============================================================================
  // BakerySwap - NFT + DEX (1-2% market share)
  // ============================================================================
  {
    name: 'BakerySwap',
    routerAddress: '0xCDe540d7eAFE93aC5f623E95792d853791C5C3ed',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0xb6f9de95', // swapExactTokensForTokensSupportingFeeOnTransferTokens
    ],
    riskLevel: 'medium',
    marketShare: '1%',
  },

  // ============================================================================
  // KnightSwap - Gaming DEX (<1% market share)
  // ============================================================================
  {
    name: 'KnightSwap',
    routerAddress: '0x05E0EEBb73B89c0EE8d05B94e22A7E1366D13A83',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
    ],
    riskLevel: 'medium',
    marketShare: '0.5%',
  },

  // ============================================================================
  // JetSwap - Community DEX (<1% market share)
  // ============================================================================
  {
    name: 'JetSwap',
    routerAddress: '0xBe65c69b1B9fB96Bd989B8778a6B5e2Ab27f9C3E',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
    ],
    riskLevel: 'medium',
    marketShare: '0.3%',
  },

  // ============================================================================
  // CheeseSwap - Yield farming DEX (<1% market share)
  // ============================================================================
  {
    name: 'CheeseSwap',
    routerAddress: '0x3047799262d8D2EF41eD25a1b88D67E19b4FcD4B',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
    ],
    riskLevel: 'low',
    marketShare: '0.2%',
  },

  // ============================================================================
  // WaultSwap - Cross-chain DEX (<1% market share)
  // ============================================================================
  {
    name: 'WaultSwap',
    routerAddress: '0xD48745E57Bb0085a2e0c243423a5c76F074244a3',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
    ],
    riskLevel: 'low',
    marketShare: '0.2%',
  },

  // ============================================================================
  // SwapLiquidity - Newer DEX (<0.5% market share)
  // ============================================================================
  {
    name: 'SwapLiquidity',
    routerAddress: '0x93b98901509C73c5983cCd2F88084d5a6C96cF00',
    version: 'V2',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
    ],
    riskLevel: 'low',
    marketShare: '0.1%',
  },

  // ============================================================================
  // Rubic Finance - Cross-chain aggregator (<0.5% market share)
  // ============================================================================
  {
    name: 'Rubic',
    routerAddress: '0x333C9430c42dE54eA33F61617Cd8E9287c93d7E9',
    version: 'Aggregator',
    functionSignatures: [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
    ],
    riskLevel: 'medium',
    marketShare: '0.3%',
  },
];

/**
 * Get all unique function signatures from all DEXs
 */
export function getAllDexSignatures(): string[] {
  const signatures = new Set<string>();
  
  for (const dex of BSC_DEX_REGISTRY) {
    for (const sig of dex.functionSignatures) {
      signatures.add(sig.toLowerCase());
    }
  }
  
  return Array.from(signatures);
}

/**
 * Get DEX info by router address
 */
export function getDexByRouter(routerAddress: string): DexInfo | undefined {
  return BSC_DEX_REGISTRY.find(
    dex => dex.routerAddress.toLowerCase() === routerAddress.toLowerCase()
  );
}

/**
 * Get all DEXs that use a specific function signature
 */
export function getDexesBySignature(signature: string): DexInfo[] {
  const sig = signature.toLowerCase();
  return BSC_DEX_REGISTRY.filter(
    dex => dex.functionSignatures.some(s => s.toLowerCase() === sig)
  );
}

/**
 * Calculate total market coverage
 */
export function calculateMarketCoverage(): { 
  totalDexes: number; 
  totalSignatures: number;
  coveragePercent: number;
} {
  const uniqueSignatures = getAllDexSignatures();
  
  return {
    totalDexes: BSC_DEX_REGISTRY.length,
    totalSignatures: uniqueSignatures.length,
    coveragePercent: 99.5, // Estimated coverage of BSC DEX volume
  };
}

/**
 * High-risk DEXs (most targeted by MEV bots)
 */
export function getHighRiskDexes(): DexInfo[] {
  return BSC_DEX_REGISTRY.filter(dex => dex.riskLevel === 'high');
}

/**
 * Check if a transaction interacts with a known DEX
 */
export function isKnownDexTransaction(
  toAddress: string | undefined, 
  data: string | undefined
): { isDex: boolean; dexInfo?: DexInfo; signature?: string } {
  if (!toAddress || !data || data.length < 10) {
    return { isDex: false };
  }

  const signature = data.slice(0, 10).toLowerCase();
  
  // Check if to address matches a known DEX router
  const dexByRouter = getDexByRouter(toAddress);
  if (dexByRouter) {
    // Check if function signature is known
    if (dexByRouter.functionSignatures.some(sig => sig.toLowerCase() === signature)) {
      return { isDex: true, dexInfo: dexByRouter, signature };
    }
  }
  
  // Check if function signature matches any DEX
  const matchingDexes = getDexesBySignature(signature);
  if (matchingDexes.length > 0) {
    // Return the highest market share DEX
    const highestMarketShare = matchingDexes.sort((a, b) => 
      parseFloat(b.marketShare) - parseFloat(a.marketShare)
    )[0];
    return { isDex: true, dexInfo: highestMarketShare, signature };
  }
  
  return { isDex: false };
}
