export interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
  suggestion?: string;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  timestamp: Date;
  results: TestResult[];
}

export interface TestConfig {
  serverUrl: string;
  wsUrl: string;
  adminToken: string;
  apiKey: string;
  databaseUrl?: string;
  webhookTestUrl: string;
  busdTokenAddress: string;
  requestTimeout: number;
  websocketTimeout: number;
}
