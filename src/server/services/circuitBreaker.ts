/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascade failures by stopping requests to failing endpoints.
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 */

import { logger } from '../config/logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening circuit
  successThreshold: number;      // Successes needed to close from half-open
  timeoutMs: number;             // Time before attempting half-open
  halfOpenMaxCalls: number;      // Max calls allowed in half-open state
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  consecutiveSuccesses: number;
  totalCalls: number;
  rejectedCalls: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 30000,      // 30 seconds
  halfOpenMaxCalls: 3,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime: number | null = null;
  private totalCalls = 0;
  private rejectedCalls = 0;
  private halfOpenCalls = 0;
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if circuit allows the request to proceed
   */
  canExecute(): boolean {
    this.totalCalls++;

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if timeout has elapsed to transition to HALF_OPEN
        if (this.shouldAttemptReset()) {
          this.transitionTo('HALF_OPEN');
          this.halfOpenCalls = 0;
          return true;
        }
        this.rejectedCalls++;
        logger.debug('Circuit breaker rejected call (OPEN)', { endpoint: this.name });
        return false;

      case 'HALF_OPEN':
        // Limit calls in half-open state
        if (this.halfOpenCalls < this.config.halfOpenMaxCalls) {
          this.halfOpenCalls++;
          return true;
        }
        this.rejectedCalls++;
        return false;
    }
  }

  /**
   * Record a successful call
   */
  recordSuccess(): void {
    this.successes++;

    switch (this.state) {
      case 'CLOSED':
        // Reset failure count on success
        this.failures = 0;
        this.consecutiveSuccesses = 0;
        break;

      case 'HALF_OPEN':
        this.consecutiveSuccesses++;
        if (this.consecutiveSuccesses >= this.config.successThreshold) {
          this.transitionTo('CLOSED');
          logger.info('Circuit breaker closed (endpoint recovered)', { endpoint: this.name });
        }
        break;
    }
  }

  /**
   * Record a failed call
   */
  recordFailure(error?: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.consecutiveSuccesses = 0;

    switch (this.state) {
      case 'CLOSED':
        if (this.failures >= this.config.failureThreshold) {
          this.transitionTo('OPEN');
          logger.warn('Circuit breaker opened (too many failures)', {
            endpoint: this.name,
            failures: this.failures,
            error: error?.message,
          });
        }
        break;

      case 'HALF_OPEN':
        // Any failure in half-open state reopens the circuit
        this.transitionTo('OPEN');
        logger.warn('Circuit breaker reopened (failure in half-open)', {
          endpoint: this.name,
          error: error?.message,
        });
        break;
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError(this.name);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error as Error);
      throw error;
    }
  }

  /**
   * Force circuit to specific state (for testing/emergencies)
   */
  forceState(state: CircuitState): void {
    this.transitionTo(state);
    logger.info('Circuit breaker state forced', { endpoint: this.name, state });
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls,
    };
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.timeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters on state transitions
    if (newState === 'CLOSED') {
      this.failures = 0;
      this.consecutiveSuccesses = 0;
      this.halfOpenCalls = 0;
    } else if (newState === 'HALF_OPEN') {
      this.halfOpenCalls = 0;
    }

    logger.debug('Circuit breaker state transition', {
      endpoint: this.name,
      from: oldState,
      to: newState,
    });
  }

  getState(): CircuitState {
    return this.state;
  }

  getName(): string {
    return this.name;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(public readonly endpointName: string) {
    super(`Circuit breaker is OPEN for endpoint: ${endpointName}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Circuit Breaker Registry
 * Manages circuit breakers for multiple endpoints
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceState('CLOSED');
    }
    logger.info('All circuit breakers reset');
  }

  remove(name: string): boolean {
    return this.breakers.delete(name);
  }
}

// Export singleton registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
