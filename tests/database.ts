import pg from 'pg';
import { TestConfig, TestResult } from '../types.js';

const { Client } = pg;

export async function testDatabase(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  if (!config.databaseUrl) {
    results.push({
      name: 'Database connection',
      category: 'Database & Indexer',
      passed: false,
      duration: 0,
      error: 'DATABASE_URL not configured',
      suggestion: 'Set DATABASE_URL in .env file to test database connectivity',
    });
    return results;
  }
  
  const client = new Client({ connectionString: config.databaseUrl });
  
  try {
    // Test 1: Database connection
    const start1 = Date.now();
    await client.connect();
    
    results.push({
      name: 'Database connection',
      category: 'Database & Indexer',
      passed: true,
      duration: Date.now() - start1,
      details: 'Successfully connected to PostgreSQL database',
    });
    
    // Test 2: Check Transfer table exists
    const start2 = Date.now();
    try {
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'TokenTransfer'
        );
      `);
      
      const tableExists = tableCheck.rows[0]?.exists;
      results.push({
        name: 'TokenTransfer table exists',
        category: 'Database & Indexer',
        passed: tableExists,
        duration: Date.now() - start2,
        details: tableExists ? 'TokenTransfer table found in database' : 'TokenTransfer table not found',
        suggestion: !tableExists ? 'Run: npm run prisma:migrate to create database tables' : undefined,
      });
      
      // Test 3: Query transfer count (only if table exists)
      if (tableExists) {
        const start3 = Date.now();
        try {
          const countResult = await client.query('SELECT COUNT(*) FROM "TokenTransfer";');
          const count = parseInt(countResult.rows[0]?.count || '0');
          
          results.push({
            name: 'Indexer has stored transfers',
            category: 'Database & Indexer',
            passed: count > 0,
            duration: Date.now() - start3,
            details: count > 0 ? `Found ${count} token transfer(s) in database` : 'No transfers found',
            suggestion: count === 0 ? 'Enable indexer by setting INDEXER_ENABLED=true and waiting for blocks to be scanned' : undefined,
          });
        } catch (error: any) {
          results.push({
            name: 'Indexer has stored transfers',
            category: 'Database & Indexer',
            passed: false,
            duration: Date.now() - start3,
            error: error.message,
            suggestion: 'Verify TokenTransfer table schema is correct',
          });
        }
      }
    } catch (error: any) {
      results.push({
        name: 'TokenTransfer table exists',
        category: 'Database & Indexer',
        passed: false,
        duration: Date.now() - start2,
        error: error.message,
        suggestion: 'Run Prisma migrations to set up database schema',
      });
    }
  } catch (error: any) {
    results.push({
      name: 'Database connection',
      category: 'Database & Indexer',
      passed: false,
      duration: 0,
      error: error.message,
      suggestion: 'Check DATABASE_URL and ensure PostgreSQL is running',
    });
  } finally {
    try {
      await client.end();
    } catch {}
  }
  
  return results;
}
