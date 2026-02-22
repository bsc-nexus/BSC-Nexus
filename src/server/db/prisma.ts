import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createUnavailableClient(): PrismaClient {
  const handler = () => {
    throw new Error('Prisma client unavailable. Run `npm run db:generate` and ensure DATABASE_URL is set.');
  };

  return new Proxy({} as PrismaClient, {
    get: () => handler,
  });
}

let prismaInstance: PrismaClient;

try {
  prismaInstance =
    globalForPrisma.prisma ||
    new PrismaClient({
      log: ['error', 'warn'],
    });
} catch (error) {
  console.warn('⚠️  Prisma client could not be initialized. Falling back to a no-op client for this environment.');
  prismaInstance = createUnavailableClient();
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaInstance;
}

export const prisma = prismaInstance;

export type PrismaClientType = PrismaClient;
