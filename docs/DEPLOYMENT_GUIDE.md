# BSC Nexus Production Deployment & Operations Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Database Setup](#database-setup)
6. [Running in Production](#running-in-production)
7. [First-Time Setup](#first-time-setup)
8. [Monitoring & Health](#monitoring--health)
9. [Security Best Practices](#security-best-practices)
10. [Troubleshooting](#troubleshooting)

## System Overview

BSC Nexus is an enterprise-grade BSC RPC infrastructure providing:
- **Multi-tenant API key management**
- **Intelligent RPC routing with automatic failover**
- **MEV protection for transactions**
- **Ultra-fast swap routing**
- **Rate limiting and usage tracking**
- **Prometheus metrics and health monitoring**

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ or equivalent Linux
- **Node.js**: 18.x or higher
- **PostgreSQL**: 14+ 
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 50GB+ SSD
- **Network**: Low latency connection to BSC nodes

### Software Dependencies
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Install build tools
sudo apt-get install -y build-essential
```

## Installation

### 1. Clone Repository
```bash
git clone https://github.com/your-org/bsc-nexus.git
cd bsc-nexus
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Generate Prisma Client
```bash
npm run db:generate
```

### 4. Build TypeScript
```bash
npm run build
```

## Configuration

### Environment Setup
```bash
# Copy example configuration
cp .env.example .env

# Edit with your settings
nano .env
```

### Critical Configuration Variables

```bash
# Server Configuration
NODE_ENV=production
PORT=3000

# Security - MUST CHANGE!
ADMIN_TOKEN=generate-secure-token-here # Use: openssl rand -hex 32

# Database
DATABASE_URL=postgresql://bscnexus:password@localhost:5432/bsc_nexus

# BSC RPC Endpoints (Use dedicated nodes for production)
BSC_PRIMARY_RPC_URL=https://your-primary-node.com
BSC_FALLBACK_RPC_URLS=https://backup1.com,https://backup2.com
RPC_REQUEST_TIMEOUT_MS=15000
RPC_ENDPOINT_TIMEOUT_MS=15000

# MEV Protection
ENABLE_MEV_PROTECTION=true
MEV_PROTECTION_STRATEGY=private-mempool
MEV_PROTECTION_MIN_CONFIDENCE=70

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
DEFAULT_RATE_LIMIT_PER_MINUTE=100

# Features
ENABLE_ULTRAFAST_SWAP=true
WS_ENABLED=true
METRICS_ENABLED=true
```

### Production RPC Endpoints

For production, use dedicated BSC node providers:

| Provider | Endpoint Format | Notes |
|----------|----------------|-------|
| QuickNode | `https://xxx.bsc.quiknode.pro/key/` | High performance |
| Alchemy | `https://bsc-mainnet.g.alchemy.com/v2/key` | Good reliability |
| NodeReal | `https://bsc-mainnet.nodereal.io/v1/key` | BSC native |
| Ankr | `https://rpc.ankr.com/bsc/key` | Global coverage |

## Database Setup

### 1. Create Database
```bash
sudo -u postgres psql

CREATE USER bscnexus WITH PASSWORD 'secure-password';
CREATE DATABASE bsc_nexus OWNER bscnexus;
GRANT ALL PRIVILEGES ON DATABASE bsc_nexus TO bscnexus;
\q
```

### 2. Run Migrations
```bash
npm run db:migrate
```

### 3. Verify Database
```bash
# Test connection
psql postgresql://bscnexus:password@localhost:5432/bsc_nexus -c "SELECT 1;"

# View schema
npm run db:studio
```

## Running in Production

### Option 1: PM2 Process Manager (Recommended)
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup auto-restart on reboot
pm2 startup
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'bsc-nexus',
    script: './dist/server/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

### Option 2: Docker Deployment
```bash
# Build image
docker build -t bsc-nexus:latest .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f bsc-nexus
```

### Option 3: Systemd Service
```bash
# Create service file
sudo nano /etc/systemd/system/bsc-nexus.service
```

```ini
[Unit]
Description=BSC Nexus RPC Service
After=network.target postgresql.service

[Service]
Type=simple
User=bscnexus
WorkingDirectory=/opt/bsc-nexus
ExecStart=/usr/bin/node dist/server/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable bsc-nexus
sudo systemctl start bsc-nexus
sudo systemctl status bsc-nexus
```

## First-Time Setup

### 1. Create Admin Tenant
```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Organization",
    "email": "admin@example.com"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "tenant-uuid",
    "name": "Your Organization"
  }
}
```

### 2. Create API Key
```bash
curl -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-uuid",
    "label": "Production API Key",
    "rateLimitPerMinute": 1000
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "key": "bsc-nexus-xxxxxxxxxx",
    "id": "key-uuid"
  }
}
```

### 3. Test API Access
```bash
curl -X POST http://localhost:3000/v1/rpc \
  -H "X-API-Key: bsc-nexus-xxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_blockNumber",
    "params": []
  }'
```

## Monitoring & Health

### Health Check Endpoint
```bash
# Basic health
curl http://localhost:3000/health

# Detailed health
curl http://localhost:3000/health?detailed=true
```

### Prometheus Metrics
```bash
# View metrics
curl http://localhost:3000/metrics
```

Key metrics to monitor:
- `rpc_requests_total` - Total requests by method
- `rpc_request_duration_seconds` - Request latency
- `rpc_upstream_errors_total` - Upstream failures
- `rate_limit_exceeded_total` - Rate limit hits

### Grafana Setup
1. Add Prometheus data source
2. Import dashboard from `monitoring/grafana-dashboard.json`
3. Set up alerts for:
   - Error rate > 1%
   - P99 latency > 500ms
   - All RPC endpoints down
   - Database connection failures

### Logging
```bash
# View PM2 logs
pm2 logs bsc-nexus

# Tail specific log
tail -f /var/log/bsc-nexus/app.log

# Search errors
grep ERROR /var/log/bsc-nexus/app.log
```

## Security Best Practices

### 1. Secure Admin Token
```bash
# Generate secure token
openssl rand -hex 32

# Store in environment variable, not in code
export ADMIN_TOKEN="your-secure-token"
```

### 2. Database Security
```bash
# Use SSL connection
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Restrict connections
# In postgresql.conf:
listen_addresses = 'localhost'

# In pg_hba.conf:
local   all   all                     md5
host    all   all   127.0.0.1/32      md5
```

### 3. Network Security
```bash
# Configure firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 443/tcp   # HTTPS
sudo ufw deny 3000/tcp   # Block direct access
sudo ufw enable
```

### 4. Reverse Proxy (Nginx)
```nginx
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting at proxy level
        limit_req zone=api burst=20 nodelay;
    }
}
```

### 5. API Key Security
- Rotate keys regularly
- Use different keys for different environments
- Monitor key usage patterns
- Implement IP whitelisting for sensitive keys

## Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check migrations
npx prisma migrate status

# Reset database (CAUTION: Data loss!)
npx prisma migrate reset
```

### RPC Endpoint Failures
```bash
# Test endpoints directly
curl -X POST https://bsc-dataseed.binance.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check health endpoint
curl http://localhost:3000/health | jq .components.rpcUpstream
```

### High Memory Usage
```bash
# Monitor with PM2
pm2 monit

# Increase heap size
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Check for memory leaks
node --inspect dist/server/server.js
```

### Rate Limiting Issues
```sql
-- Check current usage
SELECT 
  ak.label,
  COUNT(*) as requests,
  DATE_TRUNC('minute', au.timestamp) as minute
FROM api_usage au
JOIN api_keys ak ON au.api_key_id = ak.id
WHERE au.timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY ak.label, minute
ORDER BY minute DESC, requests DESC;
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm start

# Or set log level
LOG_LEVEL=debug npm start
```

## Performance Tuning

### PostgreSQL Optimization
```sql
-- Increase connection pool
ALTER SYSTEM SET max_connections = 200;

-- Optimize for SSD
ALTER SYSTEM SET random_page_cost = 1.1;

-- Increase shared buffers
ALTER SYSTEM SET shared_buffers = '256MB';

-- Reload configuration
SELECT pg_reload_conf();
```

### Node.js Optimization
```javascript
// PM2 cluster mode for multi-core
{
  instances: 'max',
  exec_mode: 'cluster'
}

// Connection pooling
DATABASE_URL="...?pool_max=20"
```

### RPC Optimization
- Use geographically close endpoints
- Implement request coalescing
- Cache immutable data (blocks, transactions)
- Use WebSocket subscriptions for real-time data

## Backup & Recovery

### Database Backup
```bash
# Manual backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Automated daily backup
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/bsc-nexus-$(date +\%Y\%m\%d).sql.gz

# Restore from backup
psql $DATABASE_URL < backup.sql
```

### Application Backup
```bash
# Backup configuration and keys
tar -czf config-backup.tar.gz .env prisma/

# Backup logs
tar -czf logs-$(date +%Y%m%d).tar.gz logs/
```

## Support & Resources

- **Documentation**: See `/docs` folder for detailed guides
- **API Reference**: See `API_REFERENCE.md`
- **GitHub Issues**: Report bugs and feature requests
- **Community**: Discord/Telegram for support

## License

MIT - See LICENSE file for details