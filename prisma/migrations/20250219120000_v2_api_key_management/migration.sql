-- Migration: V2 API Key Management & Multi-Tenancy
-- Created: 2026-02-19

-- ============================================
-- Step 1: Create enum types
-- ============================================

-- Create TenantTier enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantTier') THEN
        CREATE TYPE "TenantTier" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM');
    END IF;
END
$$;

-- Create TenantStatus enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantStatus') THEN
        CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'DEACTIVATED');
    END IF;
END
$$;

-- Create ApiKeyScope enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApiKeyScope') THEN
        CREATE TYPE "ApiKeyScope" AS ENUM ('RPC_READ', 'RPC_WRITE', 'SWAP', 'ADMIN_READ', 'ADMIN_WRITE', 'MEV_PROTECTION', 'ANALYTICS');
    END IF;
END
$$;

-- Create AuditAction enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
        CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'DEACTIVATE', 'ROTATE', 'VIEW', 'EXPORT');
    END IF;
END
$$;

-- Create AuditResource enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditResource') THEN
        CREATE TYPE "AuditResource" AS ENUM ('TENANT', 'API_KEY', 'USAGE_DATA', 'CONFIG', 'BILLING');
    END IF;
END
$$;

-- ============================================
-- Step 2: Migrate existing data
-- ============================================

-- Create default tenant for existing API keys
INSERT INTO "Tenant" (id, name, tier, status, "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    'Default Tenant',
    'FREE',
    'ACTIVE',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Get the default tenant ID
DO $$
DECLARE
    default_tenant_id UUID;
BEGIN
    SELECT id INTO default_tenant_id FROM "Tenant" LIMIT 1;
    
    -- Update existing API keys to belong to the default tenant
    UPDATE "ApiKey" 
    SET "tenantId" = default_tenant_id
    WHERE "tenantId" IS NULL OR "tenantId" = '';
END
$$;

-- ============================================
-- Step 3: Add new columns to existing tables
-- ============================================

-- Add columns to ApiKey table
ALTER TABLE "ApiKey" 
    ADD COLUMN IF NOT EXISTS "keyPrefix" VARCHAR(20),
    ADD COLUMN IF NOT EXISTS "rateLimitPerHour" INTEGER,
    ADD COLUMN IF NOT EXISTS "rateLimitPerDay" INTEGER,
    ADD COLUMN IF NOT EXISTS "scopes" VARCHAR(50)[] DEFAULT ARRAY['RPC_READ'],
    ADD COLUMN IF NOT EXISTS "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "deactivatedReason" TEXT,
    ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "totalRequests" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- Add columns to ApiUsage table
ALTER TABLE "ApiUsage"
    ADD COLUMN IF NOT EXISTS "path" TEXT,
    ADD COLUMN IF NOT EXISTS "clientIp" TEXT,
    ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
    ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
    ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
    ADD COLUMN IF NOT EXISTS "costEstimate" DECIMAL(10, 6);

-- Add columns to Tenant table
ALTER TABLE "Tenant"
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "email" TEXT,
    ADD COLUMN IF NOT EXISTS "billingEmail" TEXT,
    ADD COLUMN IF NOT EXISTS "tier" VARCHAR(20) DEFAULT 'FREE',
    ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS "maxApiKeys" INTEGER,
    ADD COLUMN IF NOT EXISTS "maxRequestsPerDay" INTEGER,
    ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

-- ============================================
-- Step 4: Create new AuditLog table
-- ============================================

CREATE TABLE IF NOT EXISTS "AuditLog" (
    id TEXT NOT NULL,
    "adminId" TEXT,
    "adminEmail" TEXT,
    "tenantId" TEXT,
    "apiKeyId" TEXT,
    action "AuditAction" NOT NULL,
    resource "AuditResource" NOT NULL,
    "resourceId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id)
);

-- Create indexes for AuditLog
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"(action);
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_adminId_idx" ON "AuditLog"("adminId");

-- ============================================
-- Step 5: Create new indexes on existing tables
-- ============================================

-- ApiKey indexes
CREATE INDEX IF NOT EXISTS "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");
CREATE INDEX IF NOT EXISTS "ApiKey_isActive_idx" ON "ApiKey"("isActive");
CREATE INDEX IF NOT EXISTS "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");
CREATE INDEX IF NOT EXISTS "ApiKey_lastUsedAt_idx" ON "ApiKey"("lastUsedAt");

-- ApiUsage indexes
CREATE INDEX IF NOT EXISTS "ApiUsage_timestamp_idx" ON "ApiUsage"("timestamp");
CREATE INDEX IF NOT EXISTS "ApiUsage_endpoint_idx" ON "ApiUsage"(endpoint);
CREATE INDEX IF NOT EXISTS "ApiUsage_statusCode_idx" ON "ApiUsage"("statusCode");

-- Tenant indexes
CREATE INDEX IF NOT EXISTS "Tenant_status_idx" ON "Tenant"(status);
CREATE INDEX IF NOT EXISTS "Tenant_tier_idx" ON "Tenant"(tier);

-- ============================================
-- Step 6: Update existing data
-- ============================================

-- Generate key prefixes for existing API keys
UPDATE "ApiKey" 
SET "keyPrefix" = SUBSTRING(key FROM 1 FOR 12)
WHERE "keyPrefix" IS NULL;

-- Set default scopes for existing API keys
UPDATE "ApiKey"
SET "scopes" = ARRAY['RPC_READ']
WHERE "scopes" IS NULL OR array_length("scopes", 1) IS NULL;

-- Set default allowedIps for existing API keys
UPDATE "ApiKey"
SET "allowedIps" = ARRAY[]::TEXT[]
WHERE "allowedIps" IS NULL;

-- ============================================
-- Step 7: Add foreign key constraints
-- ============================================

-- Add foreign key from AuditLog to Tenant
ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_tenantId_fkey" 
    FOREIGN KEY ("tenantId") 
    REFERENCES "Tenant"(id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;

-- ============================================
-- Step 8: Verify migration
-- ============================================

-- Count records in each table
SELECT 'Tenants' as table_name, COUNT(*) as count FROM "Tenant"
UNION ALL
SELECT 'API Keys', COUNT(*) FROM "ApiKey"
UNION ALL
SELECT 'API Usage', COUNT(*) FROM "ApiUsage"
UNION ALL
SELECT 'Audit Logs', COUNT(*) FROM "AuditLog";
