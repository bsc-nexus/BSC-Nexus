/**
 * RPC Cache Service v2
 * 
 * Provides intelligent caching for JSON-RPC responses:
 * - In-memory LRU cache for hot data
 * - Redis integration for distributed caching
 * - Cache invalidation strategies
 * - Method-specific TTL configuration
 */

import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

// Cache entry structure
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  blockNumber?: number; // For blockchain-aware invalidation
}

// Cache statistics
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

// Method-specific cache configuration
interface CacheConfig {
  ttl: number;        // Time to live in milliseconds
  cacheable: boolean; // Whether this method can be cached
  blockAware: boolean; // Whether to invalidate on new blocks
  keyGenerator?: (params: any[]) => string;
}

// Default cache configurations by method
const DEFAULT_CACHE_CONFIGS: Record<string, CacheConfig> = {
  // Chain info - very long cache
  'eth_chainId': { ttl: 24 * 60 * 60 * 1000, cacheable: true, blockAware: false },
  'net_version': { ttl: 24 * 60 * 60 * 1000, cacheable: true, blockAware: false },
  
  // Block info - medium cache
  'eth_getBlockByNumber': { ttl: 5000, cacheable: true, blockAware: true },
  'eth_getBlockByHash': { ttl: 60000, cacheable: true, blockAware: false },
  'eth_blockNumber': { ttl: 2000, cacheable: true, blockAware: true },
  
  // Account state - short cache
  'eth_getBalance': { ttl: 3000, cacheable: true, blockAware: true },
  'eth_getTransactionCount': { ttl: 3000, cacheable: true, blockAware: true },
  'eth_getCode': { ttl: 60000, cacheable: true, blockAware: true },
  
  // Contract calls - configurable
  'eth_call': { ttl: 5000, cacheable: true, blockAware: true },
  
  // Transaction info - medium cache
  'eth_getTransactionByHash': { ttl: 30000, cacheable: true, blockAware: false },
  'eth_getTransactionReceipt': { ttl: 30000, cacheable: true, blockAware: false },
  
  // Never cache these
  'eth_sendRawTransaction': { ttl: 0, cacheable: false, blockAware: false },
  'eth_sendTransaction': { ttl: 0, cacheable: false, blockAware: false },
  'eth_estimateGas': { ttl: 5000, cacheable: true, blockAware: true },
  'eth_gasPrice': { ttl: 3000, cacheable: true, blockAware: false },
  'eth_maxPriorityFeePerGas': { ttl: 3000, cacheable: true, blockAware: false },
};

class LruCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
}

export class RpcCacheService {
  private localCache: LruCache<string, CacheEntry<any>>;
  private redis: any = null;
  private stats: CacheStats;
  private customConfigs: Map<string, CacheConfig>;
  private currentBlockNumber: number = 0;
  private blockCheckInterval?: NodeJS.Timeout;

  constructor(localCacheSize: number = 10000) {
    this.localCache = new LruCache(localCacheSize);
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0 };
    this.customConfigs = new Map();
    
    this.initializeRedis();
    this.startBlockWatcher();
  }

  private async initializeRedis(): Promise<void> {
    if (!config.redisUrl) {
      logger.info('Redis not configured, using in-memory cache only');
      return;
    }

    try {
      const RedisModule = await import('ioredis');
      const Redis = RedisModule.Redis || RedisModule.default;
      this.redis = new (Redis as any)(config.redisUrl, {
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
      });

      this.redis.on('error', (err: Error) => {
        logger.warn('Redis connection error, falling back to memory cache', { error: err.message });
        this.redis = null;
      });

      logger.info('Redis cache initialized');
    } catch (error) {
      logger.warn('Failed to initialize Redis, using in-memory cache only');
    }
  }

  private startBlockWatcher(): void {
    // Update block number every 3 seconds for cache invalidation
    this.blockCheckInterval = setInterval(async () => {
      try {
        // In real implementation, this would query the blockchain
        // For now, we'll just track that block-based invalidation is ready
        this.invalidateBlockAwareCaches();
      } catch (error) {
        logger.error('Block watcher error', { error });
      }
    }, 3000);
  }

  /**
   * Generate cache key for a JSON-RPC request
   */
  generateKey(method: string, params: any[]): string {
    const config = this.getCacheConfig(method);
    
    if (config.keyGenerator) {
      return `${method}:${config.keyGenerator(params)}`;
    }
    
    // Default: hash the sorted params
    const paramsHash = this.hashParams(params);
    return `rpc:${method}:${paramsHash}`;
  }

  private hashParams(params: any[]): string {
    try {
      // Simple hash for params
      const str = JSON.stringify(params);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16);
    } catch {
      return 'invalid';
    }
  }

  /**
   * Get cache configuration for a method
   */
  getCacheConfig(method: string): CacheConfig {
    return this.customConfigs.get(method) || 
           DEFAULT_CACHE_CONFIGS[method] || 
           { ttl: 0, cacheable: false, blockAware: false };
  }

  /**
   * Set custom cache configuration for a method
   */
  setCacheConfig(method: string, config: Partial<CacheConfig>): void {
    const existing = this.getCacheConfig(method);
    this.customConfigs.set(method, { ...existing, ...config });
    logger.info('Updated cache config', { method, config });
  }

  /**
   * Check if a method response can be cached
   */
  isCacheable(method: string): boolean {
    return this.getCacheConfig(method).cacheable;
  }

  /**
   * Get cached response
   */
  async get<T>(method: string, params: any[]): Promise<T | null> {
    if (!this.isCacheable(method)) {
      return null;
    }

    const key = this.generateKey(method, params);
    const config = this.getCacheConfig(method);
    const now = Date.now();

    // Try local cache first
    const localEntry = this.localCache.get(key);
    if (localEntry && now - localEntry.timestamp < localEntry.ttl) {
      this.stats.hits++;
      this.updateHitRate();
      logger.debug('Cache hit (local)', { method, key: key.slice(0, 20) });
      return localEntry.data;
    }

    // Try Redis if available
    if (this.redis) {
      try {
        const redisData = await this.redis.get(key);
        if (redisData) {
          const entry: CacheEntry<T> = JSON.parse(redisData);
          if (now - entry.timestamp < entry.ttl) {
            // Promote to local cache
            this.localCache.set(key, entry);
            this.stats.hits++;
            this.updateHitRate();
            logger.debug('Cache hit (redis)', { method, key: key.slice(0, 20) });
            return entry.data;
          }
        }
      } catch (error) {
        logger.warn('Redis get error', { error });
      }
    }

    this.stats.misses++;
    this.updateHitRate();
    return null;
  }

  /**
   * Store response in cache
   */
  async set<T>(method: string, params: any[], data: T): Promise<void> {
    if (!this.isCacheable(method)) {
      return;
    }

    const config = this.getCacheConfig(method);
    const key = this.generateKey(method, params);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl,
      blockNumber: this.currentBlockNumber,
    };

    // Store in local cache
    this.localCache.set(key, entry);
    this.stats.size = this.localCache.size;

    // Store in Redis if available
    if (this.redis) {
      try {
        await this.redis.setex(
          key,
          Math.ceil(config.ttl / 1000),
          JSON.stringify(entry)
        );
      } catch (error) {
        logger.warn('Redis set error', { error });
      }
    }

    logger.debug('Cache set', { method, key: key.slice(0, 20), ttl: config.ttl });
  }

  /**
   * Invalidate block-aware caches when new block arrives
   */
  private invalidateBlockAwareCaches(): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.localCache.keys()) {
      const entry = this.localCache.get(key);
      if (entry && entry.blockNumber && entry.blockNumber < this.currentBlockNumber) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.localCache.delete(key);
    }

    if (keysToDelete.length > 0) {
      logger.debug('Invalidated block-aware caches', { count: keysToDelete.length });
    }
  }

  /**
   * Update current block number (called by block watcher)
   */
  updateBlockNumber(blockNumber: number): void {
    if (blockNumber > this.currentBlockNumber) {
      this.currentBlockNumber = blockNumber;
      this.invalidateBlockAwareCaches();
    }
  }

  /**
   * Invalidate specific method cache
   */
  invalidateMethod(method: string): void {
    const prefix = `rpc:${method}:`;
    const keysToDelete: string[] = [];
    
    for (const key of this.localCache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.localCache.delete(key);
    }

    logger.info('Invalidated method cache', { method, count: keysToDelete.length });
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.localCache.clear();
    
    if (this.redis) {
      try {
        await this.redis.flushdb();
      } catch (error) {
        logger.warn('Redis clear error', { error });
      }
    }

    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0, hitRate: 0 };
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.blockCheckInterval) {
      clearInterval(this.blockCheckInterval);
    }
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    this.localCache.clear();
  }
}

// Export singleton instance
export const rpcCacheService = new RpcCacheService();
