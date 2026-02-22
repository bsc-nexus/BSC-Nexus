# BSC Nexus

Enterprise-grade RPC and trading infrastructure for Binance Smart Chain (BSC), focused on anti-MEV protection, authenticated access, and structured observability.

> **Status:** Active development (alpha) – not yet production-ready.  
> Interfaces, schemas, and behavior may change frequently.

---

## Overview

BSC Nexus is a TypeScript/Node.js backend that aims to provide a secure, scalable JSON-RPC proxy and trading infrastructure layer for Binance Smart Chain.

The current repository focuses on:

- A clean, **service-oriented backend skeleton** in TypeScript
- **API key management** and **usage logging** services
- **Rate limiting** and request middleware wiring
- **PostgreSQL + Prisma** as the persistence layer
- A unified **test and validation harness** to keep the codebase deployable and consistent

This codebase is the foundation for a future production system; it is suitable today for local development, experimentation, and extension, but should not yet be considered a finished production product.

---

## Features

### Implemented (current alpha)

- **TypeScript backend architecture**
  - Node.js 18+, ESM, `tsx` for local development
  - Express-based HTTP server and routing
- **Configuration & environment management**
  - Centralized env loading with `.env` / `.env.example`
  - Typed configuration layer for server, database, and RPC settings
- **API key service**
  - Create, look up, list, and deactivate API keys (via Prisma + PostgreSQL)
  - Unit tests covering core behaviors
- **Usage logging**
  - Usage logger service to record API requests for metering and analytics
- **Rate limiting**
  - Express rate limit middleware to control abusive traffic
- **Persistence layer**
  - Prisma ORM with migrations and schema for core entities
  - PostgreSQL as primary data store
- **Logging**
  - Winston-based structured logging
- **Validation harness**
  - `validate.mjs` script to run build + tests + basic repository checks in one command:
    - TypeScript build
    - QA test runner
    - Presence of key files (docs, env templates, tests, etc.)

### Roadmap (planned / in progress)

These are target capabilities for future phases; they are **not** fully implemented yet:

- **JSON-RPC proxy layer**
  - Forwarding to one or more upstream BSC RPC providers
  - Failover strategies and health-aware routing
- **Anti-MEV routing**
  - Policies and heuristics to avoid known MEV patterns
  - Smart selection of upstreams for sensitive methods
- **Extended telemetry**
  - Prometheus metrics for RPC calls, errors, latencies, and rate limits
  - Dashboards via Grafana (out of scope of this repo, but supported by metrics)
- **WebSocket infrastructure**
  - Real-time subscriptions for blocks, logs, and events
- **Token and chain data services**
  - Token metadata and cached lookups for common BEP-20 contracts
- **Deployment tooling**
  - Hardened Docker images and deployment recipes for cloud environments

---

## Tech Stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **Web framework:** Express
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Logging:** Winston
- **Metrics:** prom-client (Prometheus-compatible), planned integration
- **RPC tooling:** web3.js
- **WebSockets:** ws
- **Tooling:** tsx, TypeScript compiler, npm scripts

---

## Project Status & Tests

The repository includes a consolidated validation script:

```bash
npm run validate
This runs:

TypeScript build: npm run build

QA test runner: npm test

Structural checks (presence of key folders/files, docs, env template, etc.)

A successful output similar to the following indicates the repo is in a healthy state for development:
BSC Nexus Validation

==================================================

[OK] TypeScript build (npm run build)
[OK] QA test runner (npx tsx tests/test-runner.ts)
[OK] package.json present
[OK] .env.example present
[OK] Core source files present
[OK] Test files present
[OK] Documentation present

--------------------------------------------------

All 7 checks passed.

BSC Nexus appears ready for deployment.

Next steps:
1. Configure your .env file
2. Set up PostgreSQL database
3. Run: npm run db:migrate
4. Start: npm start

Getting Started
Prerequisites

Node.js 18+

npm 9+

PostgreSQL (local, Docker, or managed)

Git

1. Clone and install
git clone https://github.com/grkhmz23/bsc-nexus.git
cd bsc-nexus
npm install

2. Configure environment

Copy the example environment file:
cp .env.example .env

Then edit .env and set at least:

Server
PORT=3000
NODE_ENV=development

Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME

Upstream RPC(s) (for future/proxy functionality)
BSC_RPC_URL=https://your-bsc-rpc-or-testnet-url
# or equivalent, depending on env config

For the authoritative list of variables and their meanings, check:

.env.example

src/server/config (environment/config loader)

3. Start PostgreSQL

Example with Docker:
docker run --name bsc-nexus-db \
  -e POSTGRES_USER=bscnexus \
  -e POSTGRES_PASSWORD=strongpassword \
  -e POSTGRES_DB=bscnexus \
  -p 5432:5432 \
  -d postgres:16

Update DATABASE_URL in .env to match:
DATABASE_URL=postgresql://bscnexus:strongpassword@localhost:5432/bscnexus

4. Run database migrations
npm run db:migrate

This applies the Prisma schema and creates the necessary tables.

Running the Server
Development mode
npm run dev
# or
npm run start:dev

This uses tsx to run the TypeScript sources directly. It is appropriate for local development and debugging.

Production-style run

Compile TypeScript to JavaScript:
npm run build

Then start the compiled server:
npm start

By default, this will run dist/server/server.js (see package.json for details).
Testing & Validation

Run the main test suite:
npm test

Run TypeScript build only:
npm run build

Run full validation (build + tests + structural checks):
npm run validate

Project Structure

High-level layout (may evolve as the project grows):
bsc-nexus/
├── src/
│   └── server/
│       ├── config/       # Env/config loading, shared configuration
│       ├── middleware/   # Auth, rate limiters, logging, error handling
│       ├── routes/       # HTTP routes (health, admin, RPC proxy, etc.)
│       └── services/     # Core domain services (API keys, usage, RPC, MEV)
├── tests/                # QA test suite + test runner
│   └── test-runner.ts
├── prisma/               # Prisma schema and migrations
├── dist/                 # Compiled JS output (after build)
├── .env.example          # Environment template
├── validate.mjs          # Project validation script
├── package.json          # Dependencies and npm scripts
├── tsconfig.json         # TypeScript configuration
└── README.md

Some elements (routes, services) are scaffolds or early implementations and will expand as the project matures.

Deployment

At this stage the project is primarily intended for:

Local development

Internal testing

Iteration on architecture and services

You can still deploy it to a server or container platform if needed:

Ensure:

DATABASE_URL points to a reachable PostgreSQL instance

Upstream RPC URLs are configured in .env

Build and start:
npm run build
npm start

Optionally integrate with:

Docker (using a Dockerfile if present or your own Docker setup)

Managed Postgres (e.g., Railway, Supabase, Render, etc.)

As anti-MEV routing and advanced RPC proxy features are implemented, additional deployment guidance will be added.

Roadmap

Planned phases (high-level):

Phase 1 – Core Infrastructure (current focus)

Stable server architecture in TypeScript

API key and usage services

Prisma schema & migrations

Rate limiting and logging

Basic health endpoints and validation tooling

Phase 2 – RPC & Anti-MEV

JSON-RPC proxy layer

Multi-upstream routing and failover

Initial anti-MEV strategies

Prometheus metrics and dashboards

Phase 3 – Advanced Features

WebSockets and event subscriptions

Token metadata and chain data APIs

Advanced analytics and admin panel

Hardened Docker and cloud deployment recipes

Contributing

Contributions, issue reports, and suggestions are welcome:

Open an issue for bugs or feature requests

Submit a pull request for improvements

Use the test runner and npm run validate before submitting changes

License

This project is licensed under the MIT License. See the LICENSE file for details.

Support & Contact

For questions or discussions:

Open an issue on GitHub

Repository: https://github.com/grkhmz23/bsc-nexus
