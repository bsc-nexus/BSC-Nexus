// Enums for API Key Management V2
// These mirror the Prisma schema enums

export enum TenantTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
  CUSTOM = 'CUSTOM',
}

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
  DEACTIVATED = 'DEACTIVATED',
}

export enum ApiKeyScope {
  RPC_READ = 'RPC_READ',
  RPC_WRITE = 'RPC_WRITE',
  SWAP = 'SWAP',
  ADMIN_READ = 'ADMIN_READ',
  ADMIN_WRITE = 'ADMIN_WRITE',
  MEV_PROTECTION = 'MEV_PROTECTION',
  ANALYTICS = 'ANALYTICS',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ACTIVATE = 'ACTIVATE',
  DEACTIVATE = 'DEACTIVATE',
  ROTATE = 'ROTATE',
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
}

export enum AuditResource {
  TENANT = 'TENANT',
  API_KEY = 'API_KEY',
  USAGE_DATA = 'USAGE_DATA',
  CONFIG = 'CONFIG',
  BILLING = 'BILLING',
}
