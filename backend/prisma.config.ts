import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const migrationDatabaseUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/database/seed.ts',
  },
  ...(migrationDatabaseUrl === undefined
    ? {}
    : {
        datasource: {
          url: migrationDatabaseUrl,
        },
      }),
});
