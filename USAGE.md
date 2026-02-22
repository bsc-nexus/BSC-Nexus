BSC Nexus – Technical Developer Guide
1. Overview

This document provides technical instructions for setting up, running, testing, and extending the BSC Nexus quality assurance and RPC infrastructure framework.
It is intended for developers, auditors, and contributors who wish to verify the system locally or integrate new backend endpoints into the QA suite.

The repository:
https://github.com/grkhmz23/BSC-Nexus

2. Project Objectives

BSC Nexus is designed to:

Provide a reproducible environment for backend quality testing.

Validate reliability and response accuracy of blockchain-related endpoints.

Offer a unified framework for testing, reporting, and integration with live Binance Smart Chain RPC nodes.

The project includes:

A mock backend (mock-server.mjs) simulating core endpoints.

A test runner (test-runner.ts) executing automated checks.

Independent test modules for each endpoint category.

3. Prerequisites

Before setup, ensure that the following software is installed:

Requirement	Version	Purpose
Node.js	18.x or higher	Runtime environment
npm	9.x or higher	Package manager
Git	Latest	Repository management
4. Setup and Installation
4.1 Clone the Repository
git clone https://github.com/grkhmz23/BSC-Nexus.git
cd BSC-Nexus

4.2 Install Dependencies
npm install

4.3 Configure Environment

Duplicate .env.example and rename it to .env, or create a new .env file manually.

Example configuration:

SERVER_URL=https://potential-telegram-g4454grx77rw3x9x.github.dev
WS_URL=wss://potential-telegram-g4454grx77rw3x9x.github.dev
DATABASE_URL=postgres://user:password@localhost:5432/bsc_nexus
BSC_RPC_URL=https://bsc-dataseed.binance.org

5. Running the Backend

The mock backend simulates live endpoints used by the QA suite.

Start it with:

node mock-server.mjs


Expected output:

✅ Mock BSC Nexus backend running on http://localhost:3000


The backend will expose the following endpoints:

Endpoint	Method	Description
/health	GET	Basic service health check
/rpc	POST	Mock JSON-RPC endpoint (used in QA tests)
6. Running the QA Test Suite

To execute the full test suite:

npm test


This will automatically run:

Health checks

RPC proxy tests

Token RPC verification (connected to live BSC node)

At the end of execution, the script generates a detailed HTML report:

test-report.html


Sample test result:

Test Summary
------------
Total Tests:  4
Passed:       4 (100.0%)
Failed:       0 (0.0%)
Duration:     0.47s

7. Adding a New Endpoint
7.1 Step 1 – Extend the Mock Backend

Add a new route in mock-server.mjs:

app.get("/new-endpoint", (req, res) => {
  res.status(200).json({ message: "New endpoint operational" });
});

7.2 Step 2 – Create a New Test File

Add a corresponding test module in the tests/ directory, for example:
tests/new-endpoint.ts

Example:

import axios from "axios";
import { TestResult } from "../types.js";

export async function testNewEndpoint(config): Promise<TestResult[]> {
  const start = Date.now();
  try {
    const response = await axios.get(`${config.serverUrl}/new-endpoint`);
    const passed = response.status === 200 && response.data.message;
    return [{
      name: "New Endpoint Test",
      passed,
      duration: Date.now() - start,
      details: `Response: ${JSON.stringify(response.data)}`,
      suggestion: passed ? null : "Check response payload or route definition."
    }];
  } catch (error: any) {
    return [{
      name: "New Endpoint Test",
      passed: false,
      duration: Date.now() - start,
      error: error.message
    }];
  }
}

7.3 Step 3 – Register the Test

Open test-runner.ts and include it in the test suite list:

import { testNewEndpoint } from "./tests/new-endpoint.js";

const testSuites = [
  { name: "Health Checks", fn: () => testHealth(config) },
  { name: "RPC Proxy", fn: () => testRPC(config) },
  { name: "New Endpoint", fn: () => testNewEndpoint(config) },
];


Re-run:

npm test


The new endpoint will be included in the summary and HTML report.

8. Troubleshooting
Issue	Cause	Solution
Error: Cannot find module	Missing file or incorrect import path	Verify imports use .js extensions after TypeScript compilation
Server not reachable	Mock server not running	Run node mock-server.mjs before executing tests
Health test stuck	Port conflict or Codespace timeout	Restart the Codespace or change to a new port in mock-server.mjs
RPC endpoint invalid	BSC public node timeout	Retry or switch to another RPC URL
9. Contribution Guidelines

Fork the repository.

Create a feature branch (feature/new-endpoint).

Follow existing TypeScript and naming conventions.

Include new tests for any new features.

Submit a pull request with a concise summary of changes.

10. License

This project is licensed under the MIT License.
See the main README
 for details.

Repository: https://github.com/grkhmz23/BSC-Nexus
