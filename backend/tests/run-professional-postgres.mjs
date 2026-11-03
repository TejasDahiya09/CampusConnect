/** Requires exact-target creation OR untouched-recovery approval, plus migration approval. No automatic database drop. */
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  targetName,
  verifyApproval,
  verifyTarget,
  verifyServer,
  sqlHash,
  verifyPristineTarget,
  TemplateSafetyError,
  verifyDatabaseExistence,
  verifyNoOtherTargetSessions,
  verifyRecoveryBeforeProvisioning,
} from './helpers/professional-test-safety.mjs';

const backend = resolve(import.meta.dirname, '..');
const migration = join(
  backend,
  'prisma/migrations/20261101020000_native_professional_details/migration.sql',
);
const prerequisiteHashes = {
  '20261007000000_current_schema_baseline':
    'ad6e3b8c876c758633b20121b2539cc66cbb036e5b0473ab2e1ea058095d599b',
  '20261007010000_profile_location_skill_proficiency':
    '0adbf51d8e764a35836236b57b38d01547751ef249d020a3d7a9aff7aacf4f34',
  '20261007020000_messaging_encrypted_conversations':
    '41d1d67a4c78897ed59eeb7bba6e348c215ff0b7f4b42e71b42aa7591dbff09d',
  '20261007030000_notification_updated_at':
    '551d0ef462a57e662d3c44a46932f973b96d663be0639ebc771ae72c8d40e0d8',
  '20261024010000_content_moderation_visibility':
    '47e497ae8438893e1fae312cc30b1caa396cc53aa7f5d94f3d9810d61edde046',
  '20261025010000_landing_feature_opt_in':
    '0d1fb1633dd9c2468ea013e7ff91779750cc274a9d36bb223fb48b6e732de40f',
};
const proposed = await readFile(migration);
const hash = sqlHash(proposed);
// Approval is checked BEFORE credentials, imports with side effects or any connection.
const mode = verifyApproval(process.argv.slice(2), hash);
const prerequisiteSQL = new Map();
for (const [name, expected] of Object.entries(prerequisiteHashes)) {
  const bytes = await readFile(join(backend, 'prisma/migrations', name, 'migration.sql'));
  if (sqlHash(bytes) !== expected)
    throw new Error('Historical migration differs from reviewed prerequisite.');
  prerequisiteSQL.set(name, bytes.toString('utf8'));
}
const target = verifyTarget(process.env.PROFESSIONAL_TEST_DATABASE_URL);
for (const key of Object.keys(process.env)) if (key.startsWith('PG')) delete process.env[key];
const { Client } = await import('pg');
const maintenance = new URL(target);
maintenance.pathname = '/postgres';
const admin = new Client({
  connectionString: maintenance.toString(),
  connectionTimeoutMillis: 3000,
});
let locked = false;
try {
  await admin.connect();
  verifyServer(
    (
      await admin.query(
        "SELECT host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version') AS version",
      )
    ).rows[0],
  );
  locked = (await admin.query('SELECT pg_try_advisory_lock(13808, 1) AS locked')).rows[0].locked;
  if (!locked) throw new Error('Another Professional test run holds the exclusion lock.');
  const exists =
    (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [targetName])).rowCount !== 0;
  verifyDatabaseExistence(exists, mode);
  if (mode === 'create') await admin.query(`CREATE DATABASE "${targetName}" TEMPLATE template0`);
  const db = new Client({ connectionString: target.toString() });
  try {
    await db.connect();
    await verifyPristineTarget(db);
    if (mode === 'recover') await verifyNoOtherTargetSessions(db);
    if (sqlHash(await readFile(migration)) !== hash)
      throw new Error('Migration changed after approval.');
    const prerequisites = [
      '20261007000000_current_schema_baseline',
      '20261007010000_profile_location_skill_proficiency',
      '20261007020000_messaging_encrypted_conversations',
      '20261007030000_notification_updated_at',
      '20261024010000_content_moderation_visibility',
      '20261025010000_landing_feature_opt_in',
    ];
    await db.query('BEGIN');
    try {
      if (mode === 'recover') await verifyRecoveryBeforeProvisioning(db);
      await db.query('CREATE EXTENSION citext');
      for (const name of prerequisites) await db.query(prerequisiteSQL.get(name));
      await db.query(proposed.toString('utf8'));
      if (mode === 'recover') await verifyNoOtherTargetSessions(db);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } finally {
    await db.end();
  }
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: 'NUL',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    PROFESSIONAL_TEST_DATABASE_URL: target.toString(),
    PROFESSIONAL_TEST_APPROVED_HASH: hash,
  };
  for (const key of Object.keys(env))
    if (
      key.startsWith('PG') ||
      key.startsWith('SUPABASE') ||
      key.startsWith('AWS') ||
      key.startsWith('AI_') ||
      key === 'DIRECT_URL' ||
      key === 'PROFILE_PROFESSIONAL_STORAGE_READY' ||
      (key.endsWith('TEST_DATABASE_URL') && key !== 'PROFESSIONAL_TEST_DATABASE_URL')
    )
      delete env[key];
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/professional-postgres.test.ts'],
    { cwd: backend, env, stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
  console.log('Disposable database retained for inspection. No automatic DROP or reset.');
} catch (error) {
  if (error instanceof TemplateSafetyError)
    console.error(error.message, JSON.stringify(error.unexpected));
  console.error(
    'Professional isolated run stopped. No automatic repair or database deletion. Inspect the verified local target before retrying.',
  );
  process.exitCode = 1;
} finally {
  if (locked) await admin.query('SELECT pg_advisory_unlock(13808, 1)');
  await admin.end();
}
