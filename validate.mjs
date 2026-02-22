#!/usr/bin/env node

/**
 * BSC Nexus Build and Test Validation Script
 * Run this from the project root to verify the system is properly configured.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import chalk from 'chalk';

const tests = [];

// Test helper
function runTest(name, fn) {
  tests.push({ name, fn });
}

// Run command helper
async function runCommand(cmd, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true, stdio: 'pipe' });
    let output = '';
    proc.stdout.on('data', (data) => (output += data.toString()));
    proc.stderr.on('data', (data) => (output += data.toString()));
    proc.on('close', (code) => {
      resolve({ code, output });
    });
  });
}

// Tests

runTest('TypeScript build (npm run build)', async () => {
  const result = await runCommand('npm', ['run', 'build']);
  return result.code === 0;
});

runTest('QA test runner (npx tsx tests/test-runner.ts)', async () => {
  const result = await runCommand('npx', ['tsx', 'tests/test-runner.ts']);
  return result.code === 0;
});

runTest('package.json present', () => {
  return existsSync('./package.json');
});

runTest('.env.example present', () => {
  return existsSync('./.env.example');
});

runTest('Core source files present', () => {
  const files = [
    './src/server/server.ts',
    './src/server/app.ts',
    './src/server/config/env.ts',
    './src/server/services/rpcProxy.ts',
    './src/server/services/mevProtectionService.ts',
    './src/server/services/ultraFastSwapService.ts',
  ];
  return files.every((f) => existsSync(f));
});

runTest('Test files present', () => {
  const files = [
    './tests/api-key-service.unit.ts',
    './tests/usage-logger.unit.ts',
    './tests/rate-limit-service.unit.ts',
    './tests/rpc-proxy-routing.unit.ts',
    './tests/test-runner.ts',
  ];
  return files.every((f) => existsSync(f));
});

runTest('Documentation present', () => {
  const files = [
    './README.md',
    './docs/API_REFERENCE.md',
    './docs/DEPLOYMENT_GUIDE.md',
    './PROJECT_STATUS.md',
  ];
  return files.every((f) => existsSync(f));
});

// Run all tests
async function main() {
  console.log(chalk.bold.cyan('\nBSC Nexus Validation\n'));
  console.log(chalk.gray('='.repeat(50)) + '\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        console.log(chalk.green('[OK]'), chalk.white(test.name));
        passed++;
      } else {
        console.log(chalk.red('[FAIL]'), chalk.red(test.name));
        failed++;
      }
    } catch (error) {
      console.log(
        chalk.red('[ERROR]'),
        chalk.red(test.name),
        chalk.gray(`(${error?.message || 'unexpected error'})`)
      );
      failed++;
    }
  }

  console.log('\n' + chalk.gray('-'.repeat(50)));

  if (failed === 0) {
    console.log(chalk.bold.green(`\nAll ${passed} checks passed.\n`));
    console.log(chalk.cyan('BSC Nexus appears ready for deployment.'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('1. Configure your .env file'));
    console.log(chalk.gray('2. Set up PostgreSQL database'));
    console.log(chalk.gray('3. Run: npm run db:migrate'));
    console.log(chalk.gray('4. Start: npm start\n'));
  } else {
    console.log(chalk.bold.red(`\n${failed} checks failed.\n`));
    console.log(chalk.yellow('Please fix the reported issues before deployment.\n'));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
