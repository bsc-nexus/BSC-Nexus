import Web3 from 'web3';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

// ERC-20 function signatures
const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
];

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
}

const web3 = new Web3(config.upstreamRpcUrl);

// Cache token info to reduce RPC calls
const tokenCache = new Map<string, { data: TokenInfo; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Get token information from BSC
 */
export async function getTokenInfo(address: string): Promise<TokenInfo> {
  const normalizedAddress = address.toLowerCase();
  
  // Check cache
  const cached = tokenCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('Token info from cache', { address: normalizedAddress });
    return cached.data;
  }
  
  try {
    // Validate address
    if (!web3.utils.isAddress(address)) {
      throw new Error('Invalid token address');
    }
    
    logger.debug('Fetching token info from chain', { address: normalizedAddress });
    
    const contract = new web3.eth.Contract(ERC20_ABI as any, address);
    
    // Fetch token metadata in parallel
    const [name, symbol, decimals] = await Promise.all([
      contract.methods.name().call() as Promise<string>,
      contract.methods.symbol().call() as Promise<string>,
      contract.methods.decimals().call() as Promise<number>,
    ]);
    
    const tokenInfo: TokenInfo = {
      address: normalizedAddress,
      name,
      symbol,
      decimals: Number(decimals),
    };
    
    // Cache the result
    tokenCache.set(normalizedAddress, {
      data: tokenInfo,
      timestamp: Date.now(),
    });
    
    logger.info('Token info fetched', {
      address: normalizedAddress,
      symbol,
      name,
    });
    
    return tokenInfo;
  } catch (error: any) {
    logger.error('Failed to fetch token info', {
      address: normalizedAddress,
      error: error.message,
    });
    throw new Error(`Failed to fetch token info: ${error.message}`);
  }
}

/**
 * Get token balance for an address
 */
export async function getTokenBalance(
  tokenAddress: string,
  holderAddress: string
): Promise<string> {
  try {
    if (!web3.utils.isAddress(tokenAddress) || !web3.utils.isAddress(holderAddress)) {
      throw new Error('Invalid address');
    }
    
    const contract = new web3.eth.Contract(ERC20_ABI as any, tokenAddress);
    const balance = await contract.methods.balanceOf(holderAddress).call();
    
    return balance ? String(balance) : '0';
  } catch (error: any) {
    logger.error('Failed to fetch token balance', {
      tokenAddress,
      holderAddress,
      error: error.message,
    });
    throw new Error(`Failed to fetch token balance: ${error.message}`);
  }
}
