import crypto from 'crypto';
import { prisma as defaultPrisma, PrismaClientType } from '../db/prisma.js';
import { logger } from '../config/logger.js';

let prisma: PrismaClientType = defaultPrisma;

export interface ApiKeyRecord {
  id: string;
  key: string;
  label: string | null;
  tenantId: string;
  isActive: boolean;
  rateLimitPerMinute: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function setPrismaClient(client: PrismaClientType): void {
  prisma = client;
}

export async function getApiKeyByValue(keyValue: string): Promise<ApiKeyRecord | null> {
  return prisma.apiKey.findUnique({
    where: { key: keyValue },
  });
}
export async function getApiKeyById(id: string): Promise<ApiKeyRecord | null> {
  return prisma.apiKey.findUnique({
    where: { id },
  });
}

export interface CreateApiKeyParams {
  tenantId: string;
  label?: string;
  rateLimitPerMinute?: number;
}

export async function createApiKey(params: CreateApiKeyParams): Promise<ApiKeyRecord> {
  const apiKeyValue = crypto.randomBytes(32).toString('hex');

  const apiKey = await prisma.apiKey.create({
    data: {
      key: apiKeyValue,
      label: params.label,
      tenantId: params.tenantId,
      rateLimitPerMinute: params.rateLimitPerMinute,
    },
  });

  logger.info('API key created', {
    tenantId: params.tenantId,
    label: params.label,
    id: apiKey.id,
  });

  return apiKey;
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  return prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function deactivateApiKey(id: string): Promise<void> {
  await prisma.apiKey.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function rotateApiKey(id: string): Promise<ApiKeyRecord> {
  const newKeyValue = crypto.randomBytes(32).toString('hex');

  const apiKey = await prisma.apiKey.update({
    where: { id },
    data: { key: newKeyValue },
  });

  logger.info('API key rotated', { id });

  return apiKey;
}
