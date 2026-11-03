/** Prepared target-only data tests. Never initialize schema. Separate execution approval required. */
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  schemaDigest,
  verifyHttpApproval,
  verifyMigrationFiles,
} from './helpers/professional-http-safety.mjs';
import { runTargetHttp } from './helpers/professional-http-runner.mjs';
const backend = resolve(import.meta.dirname, '..');
const snapshot = JSON.parse(
  await readFile(join(backend, 'tests/fixtures/professional-retained-schema.json'), 'utf8'),
);
const digest = schemaDigest(snapshot);
// Approval and all seven SQL-file identities precede credential use or a connection.
verifyHttpApproval(process.argv.slice(2), digest);
await verifyMigrationFiles(new URL('../prisma/migrations/', import.meta.url));
const raw = process.env.PROFESSIONAL_HTTP_TEST_DATABASE_URL;
for (const key of Object.keys(process.env)) if (key.startsWith('PG')) delete process.env[key];
const { Client } = await import('pg');
try {
  process.exitCode = await runTargetHttp({
    raw,
    application: 'cc-prof-http-' + randomUUID(),
    snapshot,
    createClient: (options) => new Client(options),
    runChild: async (parent) => {
      const env = {
        ...process.env,
        NODE_ENV: 'test',
        DOTENV_CONFIG_PATH: 'NUL',
        DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
        PROFESSIONAL_HTTP_APPROVED_SCHEMA: digest,
        PROFESSIONAL_HTTP_RUNNER_PID: String(parent.pid),
        PROFESSIONAL_HTTP_RUNNER_STARTED: parent.started,
        PROFESSIONAL_HTTP_RUNNER_APPLICATION: parent.application,
      };
      for (const key of Object.keys(env))
        if (
          key.startsWith('PG') ||
          key.startsWith('SUPABASE') ||
          key.startsWith('AWS') ||
          key.startsWith('AI_') ||
          key === 'DIRECT_URL' ||
          key === 'PROFILE_PROFESSIONAL_STORAGE_READY' ||
          (key.endsWith('TEST_DATABASE_URL') && key !== 'PROFESSIONAL_HTTP_TEST_DATABASE_URL')
        )
          delete env[key];
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--test',
          '--test-concurrency=1',
          'tests/professional-http-postgres.integration.ts',
        ],
        { cwd: backend, env, stdio: 'inherit' },
      );
      return result.status ?? 1;
    },
  });
  console.log('Target-only HTTP run finished; schema unchanged, data empty, lock released.');
} catch {
  console.error(
    'Target-only HTTP run stopped. No automatic repair, reset or database deletion. Inspect the isolated target before retrying.',
  );
  process.exitCode = 1;
}
