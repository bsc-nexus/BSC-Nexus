export interface SwapRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  recipient: string;
  deadline: number;
}

export interface SwapRoute {
  path: string[];
  pools: string[];
  router: string;
  routerName: string;
  percentage: number;
}

export interface SwapQuote {
  amountOut: string;
  amountOutMin: string;
  routes: SwapRoute[];
  priceImpact: string;
  estimatedGas: string;
  effectiveRate: string;
  breakdown: {
    inputValue: string;
    outputValue: string;
    minimumOutput: string;
    lpFees: string;
    protocolFees: string;
    networkFees: string;
  };
  warnings: string[];
  expiresAt: number;
}

export interface SwapExecution {
  quote: SwapQuote;
  transaction: any;
  txHash: string;
  status: 'submitted' | 'failed' | 'confirmed';
  submittedAt: number;
  estimatedCompletionTime: number;
  mevProtection?: {
    enabled: boolean;
    method: string;
    confidence: number;
  };
}
