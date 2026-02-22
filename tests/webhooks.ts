import axios from 'axios';
import { TestConfig, TestResult } from './types.js';

// Helper function to reduce complexity
async function makeWebhookRequest(
  method: 'get' | 'post' | 'delete',
  url: string,
  name: string,
  config: TestConfig,
  data?: any,
  validateResponse?: (response: any) => { passed: boolean; message: string }
): Promise<TestResult> {
  const start = Date.now();
  
  try {
    const requestConfig = {
      headers: {
        'x-api-key': config.apiKey,
        ...(data && { 'content-type': 'application/json' }),
      },
      timeout: config.requestTimeout,
    };

    let response;
    if (method === 'get') {
      response = await axios.get(url, requestConfig);
    } else if (method === 'post') {
      response = await axios.post(url, data || {}, requestConfig);
    } else {
      response = await axios.delete(url, requestConfig);
    }
    
    const validation = validateResponse ? validateResponse(response) : { passed: true, message: 'Success' };
    
    return {
      name,
      category: 'Webhooks',
      passed: validation.passed,
      duration: Date.now() - start,
      details: validation.message,
      suggestion: !validation.passed ? 'Check webhook endpoint implementation' : undefined,
    };
  } catch (error: any) {
    return {
      name,
      category: 'Webhooks',
      passed: false,
      duration: Date.now() - start,
      error: error.message,
      suggestion: error.response?.status === 401 
        ? 'Verify API key is valid' 
        : 'Check webhook endpoint implementation',
    };
  }
}

export async function testWebhooks(config: TestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let webhookId: string | undefined;
  
  // Test 1: Create webhook
  const createResult = await makeWebhookRequest(
    'post',
    `${config.serverUrl}/v1/webhooks`,
    'POST /v1/webhooks - Create webhook',
    config,
    {
      event: 'token_transfer',
      callbackUrl: config.webhookTestUrl,
    },
    (response) => {
      const passed = response.status === 200 && response.data?.id && response.data?.secret;
      webhookId = response.data?.id;
      return {
        passed,
        message: passed ? `Webhook created with ID: ${webhookId}` : 'Failed to create webhook',
      };
    }
  );
  results.push(createResult);
  
  // Test 2: List webhooks
  const listResult = await makeWebhookRequest(
    'get',
    `${config.serverUrl}/v1/webhooks`,
    'GET /v1/webhooks - List webhooks',
    config,
    undefined,
    (response) => {
      const passed = response.status === 200 && Array.isArray(response.data?.webhooks);
      return {
        passed,
        message: passed 
          ? `Found ${response.data.webhooks.length} webhook(s)` 
          : 'Failed to list webhooks',
      };
    }
  );
  results.push(listResult);
  
  // Test 3: Send test webhook (only if webhook was created)
  if (webhookId) {
    const testResult = await makeWebhookRequest(
      'post',
      `${config.serverUrl}/v1/webhooks/test/${webhookId}`,
      'POST /v1/webhooks/test/:id - Test webhook',
      config,
      {},
      (response) => {
        const passed = response.status === 200 && response.data?.delivered !== undefined;
        return {
          passed,
          message: passed 
            ? `Test webhook ${response.data.delivered ? 'delivered' : 'failed to deliver'}` 
            : 'Failed to send test webhook',
        };
      }
    );
    results.push(testResult);
  }
  
  // Test 4: Delete webhook (only if webhook was created)
  if (webhookId) {
    const deleteResult = await makeWebhookRequest(
      'delete',
      `${config.serverUrl}/v1/webhooks/${webhookId}`,
      'DELETE /v1/webhooks/:id - Delete webhook',
      config,
      undefined,
      (response) => {
        const passed = response.status === 200 && response.data?.ok === true;
        return {
          passed,
          message: passed ? 'Webhook successfully deleted' : 'Failed to delete webhook',
        };
      }
    );
    results.push(deleteResult);
  }
  
  return results;
}