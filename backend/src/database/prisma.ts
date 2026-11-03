import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

const globalDatabase = globalThis as typeof globalThis & {
  campusConnectPrisma?: PrismaClient;
};

const createPrismaClient = (): PrismaClient => {
  if (env.databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required before the Prisma client can be used.');
  }

  const adapter = new PrismaPg({
    connectionString: env.databaseUrl,
    connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
    max: env.databasePoolMax,
  });

  return new PrismaClient({
    adapter,
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });
};

export const prisma = globalDatabase.campusConnectPrisma ?? createPrismaClient();

if (!env.isProduction) {
  globalDatabase.campusConnectPrisma = prisma;
}
