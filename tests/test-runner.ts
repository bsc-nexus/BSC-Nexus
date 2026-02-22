import chalk from 'chalk';
import { loadConfig } from './config.js';
import { testHealthService } from './health.unit.js';
// Integration tests (require running server) - skipped for unit testing
// import { testRPC } from './rpc.js';
import { testTokenService } from './token-service.unit.js';
// Phase 2+ integration tests - skipped
// import { testGraphQL } from './graphql.js';
// import { testWebSocket } from './websocket.js';
// import { testWebhooks } from './webhooks.js';
import { testSecurityMiddleware } from './security.unit.js';
// import { testDatabase } from './database.js';
import { testApiKeyService } from './api-key-service.unit.js';
import { testUsageLogger } from './usage-logger.unit.js';
import { testRateLimitService } from './rate-limit-service.unit.js';
import { testRpcProxyRouting } from './rpc-proxy-routing.unit.js';
import { testRpcProxyV2 } from './rpc-proxy-v2.unit.js';
import { testMevProtectionV2 } from './mev-protection-v2.unit.js';
import { testUltraFastSwapV2 } from './ultra-fast-swap-v2.unit.js';
import { testApiKeyManagementV2 } from './api-key-management-v2.unit.js';
import { TestSummary, TestResult } from './types.js';
import { saveHTMLReport } from './report-generator.js';

async function runAllTests(): Promise<TestSummary> {
  console.log(chalk.bold.cyan('\n🔍 BSC Nexus QA Test Suite\n'));
  console.log(chalk.gray('═'.repeat(80)) + '\n');

  const config = loadConfig();
  const startTime = Date.now();
  const allResults: TestResult[] = [];

  console.log(chalk.yellow('Configuration:'));
  console.log(chalk.gray(`  Server URL: ${config.serverUrl}`));
  console.log(chalk.gray(`  WebSocket URL: ${config.wsUrl}`));
  console.log(chalk.gray(`  Database: ${config.databaseUrl ? 'Configured' : 'Not configured'}\n`));

  const testSuites: { name: string; fn: () => Promise<TestResult[]> }[] = [
    { name: 'API Key Service', fn: () => testApiKeyService() },
    { name: 'Usage Logger', fn: () => testUsageLogger() },
    { name: 'Rate Limit Service', fn: () => testRateLimitService() },
    { name: 'RPC Routing', fn: () => testRpcProxyRouting() },
    { name: 'RPC Proxy v2', fn: () => testRpcProxyV2() },
    { name: 'MEV Protection v2', fn: () => testMevProtectionV2() },
    { name: 'Ultra-Fast Swap v2', fn: () => testUltraFastSwapV2() },
    { name: 'Health Service', fn: () => testHealthService() },
    // { name: 'RPC Proxy', fn: () => testRPC(config) },  // Integration test - requires server
    { name: 'Token Service', fn: () => testTokenService() },
    { name: 'Security Middleware', fn: () => testSecurityMiddleware() },
    { name: 'API Key Management V2', fn: () => testApiKeyManagementV2() },
    // Phase 2+ features – enable when ready:
    // { name: 'GraphQL API', fn: () => testGraphQL(config) },
    // { name: 'WebSocket', fn: () => testWebSocket(config) },
    // { name: 'Webhooks', fn: () => testWebhooks(config) },
    // { name: 'Database & Indexer', fn: () => testDatabase(config) },
  ];

  for (const suite of testSuites) {
    console.log(chalk.bold.white(`\n▶ Running ${suite.name} tests...`));
    try {
      const results = await suite.fn();
      allResults.push(...results);

      for (const result of results) {
        const icon = result.passed ? chalk.green('✅') : chalk.red('❌');
        const name = result.passed ? chalk.white(result.name) : chalk.red(result.name);
        console.log(`  ${icon} ${name} ${chalk.gray(`(${result.duration}ms)`)}`);

        if (result.details) {
          console.log(chalk.gray(`     ℹ ${result.details}`));
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`  ❌ ${suite.name} suite failed to run`));
      console.log(chalk.gray(`     ⚠ Error: ${error.message || error}`));
      allResults.push({
        name: `${suite.name} suite error`,
        category: suite.name,
        passed: false,
        duration: 0,
        details: error?.stack || String(error),
      });
    }
  }

  const duration = Date.now() - startTime;
  const passedCount = allResults.filter(r => r.passed).length;
  const failedCount = allResults.length - passedCount;

  console.log('\n' + chalk.gray('─'.repeat(80)));
  console.log(
    chalk.bold(
      failedCount === 0
        ? chalk.green(`\n✅ All ${allResults.length} tests passed in ${duration}ms\n`)
        : chalk.red(`\n❌ ${failedCount}/${allResults.length} tests failed in ${duration}ms\n`),
    ),
  );

  const summary: TestSummary = {
    totalTests: allResults.length,
    passedTests: passedCount,
    failedTests: failedCount,
    durationMs: duration,
    results: allResults,
  };

  await saveHTMLReport(summary);

  return summary;
}

/**
 * ESM-safe entrypoint: when executed directly via `npx tsx tests/test-runner.ts`,
 * run all tests. When imported, just export the function.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error(chalk.red('\nFatal error running tests:'), error);
    process.exit(1);
  });
}

export { runAllTests };
