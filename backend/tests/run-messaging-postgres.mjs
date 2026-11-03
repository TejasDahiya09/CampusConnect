/** Creates only fresh, empty, loopback Messaging fixture databases. Never reads app .env. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { parse } from 'dotenv';

const backend = resolve(import.meta.dirname, '..');
const phase11f = process.argv.includes('--phase11f');
const phase11e = phase11f || process.argv.includes('--phase11e');
const group = process.argv.includes('--services')
  ? 'services'
  : process.argv.includes('--teamup')
    ? 'teamup'
    : 'messaging';
if (process.argv.includes('--services') && process.argv.includes('--teamup'))
  throw new Error('Run each gated suite in its own fresh database.');
const privateConfig = parse(await readFile(join(backend, '.env.teamup-test.local')));
const credential =
  privateConfig.MESSAGING_TEST_DATABASE_URL ?? privateConfig.TEAMUP_TEST_DATABASE_URL;
if (!credential) throw new Error('Private local test credential is missing.');
const source = new URL(credential);
if (
  !['postgres:', 'postgresql:'].includes(source.protocol) ||
  source.hostname !== '127.0.0.1' ||
  source.port !== '5433' ||
  source.username !== 'postgres' ||
  source.search ||
  source.hash
)
  throw new Error('Refusing non-loopback or overridden local PostgreSQL configuration.');
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const admin = new Pool({ connectionString: adminUrl.toString() });
const name =
  'campusconnect_' +
  group +
  '_test_' +
  (phase11f ? '11f_' : phase11e ? '11e_' : '') +
  Date.now() +
  '_' +
  randomBytes(4).toString('hex');
if (!/^campusconnect_(messaging|services|teamup)_test_[a-z0-9_]+$/.test(name))
  throw new Error('Unsafe test database name.');
try {
  const { rows } = await admin.query(
    "SELECT host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version') AS version",
  );
  if (rows[0].host !== '127.0.0.1' || rows[0].port !== 5433 || !/^17\./.test(rows[0].version))
    throw new Error('Unexpected local PostgreSQL server.');
  console.log('Verified local PostgreSQL runtime:', rows[0].version);
  await admin.query('CREATE DATABASE "' + name + '"');
} finally {
  await admin.end();
}
const target = new URL(source);
target.pathname = '/' + name;
const verify = new Pool({ connectionString: target.toString() });
try {
  const { rows } = await verify.query(
    "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') AS tables",
  );
  if (
    rows[0].name !== name ||
    rows[0].host !== '127.0.0.1' ||
    rows[0].port !== 5433 ||
    rows[0].tables !== 0
  )
    throw new Error('Target failed identity/empty-schema verification.');
} finally {
  await verify.end();
}
console.log(
  'Verified fresh empty PostgreSQL 17 on 127.0.0.1:5433; disposable ' + group + ' fixture:',
  name,
);
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DOTENV_CONFIG_PATH: 'NUL',
  DATABASE_URL: target.toString(),
  MESSAGING_TEST_DATABASE_URL: target.toString(),
  AI_SERVICE_ENABLED: 'false',
  MESSAGE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  AWS_ACCESS_KEY_ID: 'synthetic-offline-key',
  AWS_SECRET_ACCESS_KEY: 'synthetic-offline-secret',
  AWS_REGION: 'us-east-1',
  AWS_S3_BUCKET: 'campusconnect-isolated-test',
  AWS_CLOUDFRONT_DOMAIN: 'https://cdn.example.test',
  AWS_EC2_METADATA_DISABLED: 'true',
  MESSAGING_BROWSER_INTEGRATION: phase11e && group === 'messaging' ? '1' : '0',
};
for (const key of [
  'DIRECT_URL',
  'SERVICES_TEST_DATABASE_URL',
  'TEAMUP_TEST_DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_ALLOWED_USER_ID',
  'AI_SERVICE_URL',
  'AI_SERVICE_API_KEY',
])
  delete env[key];
if (group !== 'messaging') delete env.MESSAGING_TEST_DATABASE_URL;
if (group === 'services') env.SERVICES_TEST_DATABASE_URL = target.toString();
if (group === 'teamup') env.TEAMUP_TEST_DATABASE_URL = target.toString();
const args =
  group !== 'messaging'
    ? ['tests/' + group + '-security-postgres.test.ts']
    : process.argv.includes('--all')
      ? ['tests/**/*.test.ts']
      : [
          'tests/messaging-security-postgres.test.ts',
          'tests/messaging-realtime.test.ts',
          'tests/messaging-validation.test.ts',
          'tests/messaging-read-receipt.test.ts',
          'tests/message-encryption.test.ts',
          'tests/messaging-abuse.test.ts',
        ];
const child = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...args], {
  cwd: backend,
  env,
  encoding: 'utf8',
  timeout: 240_000,
  maxBuffer: 20 * 1024 * 1024,
});
let output = (child.stdout ?? '') + (child.stderr ?? '');
for (const secret of [
  credential,
  target.toString(),
  source.password,
  decodeURIComponent(source.password),
  env.MESSAGE_ENCRYPTION_KEY,
])
  if (secret) output = output.split(secret).join('[REDACTED]');
output = output.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[REDACTED_DATABASE_URL]');
const log = join(
  tmpdir(),
  'campusconnect-' +
    group +
    '-' +
    (phase11f ? '11f' : phase11e ? '11e' : '11b') +
    '-' +
    Date.now() +
    '.log',
);
await writeFile(log, output);
console.log(output.slice(-5000));
console.log('Sanitized test log:', log);
console.log('Disposable database retained for inspection; no database dropped.');
if (child.error)
  console.error('Test child did not complete:', child.error.code ?? child.error.name);
process.exitCode = child.status ?? 1;

if (phase11f && group === 'messaging' && process.argv.includes('--restore') && child.status === 0) {
  const { rehearseMessagingRestore } = await import('./messaging-restore-rehearsal.mjs');
  await rehearseMessagingRestore(target.toString(), env.MESSAGE_ENCRYPTION_KEY);
}
