import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

/** Called only with the freshly created isolated runner target, never application dotenv. */
export async function rehearseMessagingRestore(connection, key) {
  const source = new URL(connection),
    name = source.pathname.slice(1);
  assert.equal(source.hostname, '127.0.0.1');
  assert.equal(source.port, '5433');
  assert.match(name, /^campusconnect_messaging_test_11f_[a-z0-9_]+$/);
  const output = join(tmpdir(), 'campusconnect-messaging-11f-restore-' + Date.now());
  await mkdir(output, { mode: 0o700 });
  // Windows ACL: current account and SYSTEM only; failure blocks the export.
  const who = spawnSync('whoami', [], { encoding: 'utf8' });
  assert.equal(who.status, 0);
  const acl = spawnSync(
    'icacls',
    [output, '/inheritance:r', '/grant:r', who.stdout.trim() + ':(OI)(CI)F', 'SYSTEM:(OI)(CI)F'],
    { encoding: 'utf8' },
  );
  assert.equal(acl.status, 0, 'Private backup directory ACL failed.');
  const bin = 'C:\\Program Files\\PostgreSQL\\17\\bin\\';
  const common = ['-h', '127.0.0.1', '-p', '5433', '-U', source.username, '--no-password'];
  const env = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(source.password),
    PGSSLMODE: 'disable',
  };
  for (const key of Object.keys(env))
    if (key.startsWith('PG') && !['PGPASSWORD', 'PGSSLMODE'].includes(key)) delete env[key];
  const run = (tool, args) => {
    const result = spawnSync(bin + tool + '.exe', args, { env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, tool + ' failed; no restore success claimed.');
    assert.equal(result.stderr.trim(), '', tool + ' emitted warnings; inspect safely.');
    return result.stdout;
  };
  const version = run('pg_dump', ['--version']).trim();
  assert.match(version, /17\.11/);
  const dump = join(output, 'synthetic-messaging.dump');
  run('pg_dump', [...common, '-d', name, '-Fc', '--no-owner', '--no-privileges', '-f', dump]);
  const listing = run('pg_restore', ['--list', dump]);
  assert.match(listing, /TABLE DATA public messages/);
  assert.match(listing, /TABLE DATA public conversations/);
  const sourcePool = new Pool({ connectionString: source.toString() });
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString() });
  const restored = new URL(source);
  const restoredName = name + '_r';
  restored.pathname = '/' + restoredName;
  let restoredPool;
  try {
    const identity = (
      await admin.query(
        "SELECT host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version') AS version",
      )
    ).rows[0];
    assert.equal(identity.host, '127.0.0.1');
    assert.equal(identity.port, 5433);
    assert.match(identity.version, /^17\.11/);
    assert.ok(restoredName.length <= 63);
    await admin.query('CREATE DATABASE "' + restoredName + '"');
    restoredPool = new Pool({ connectionString: restored.toString() });
    const check = (
      await restoredPool.query(
        "SELECT current_database() AS name,host(inet_server_addr()) AS host,inet_server_port() AS port,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') AS tables",
      )
    ).rows[0];
    assert.deepEqual(check, { name: restoredName, host: '127.0.0.1', port: 5433, tables: 0 });
    run('pg_restore', [
      ...common,
      '-d',
      restoredName,
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      dump,
    ]);
    const tableNames = (
      await sourcePool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((row) => row.tablename);
    const counts = {};
    for (const table of tableNames) {
      assert.match(table, /^[a-z_]+$/);
      const a = (await sourcePool.query('SELECT count(*)::int AS n FROM "' + table + '"')).rows[0]
        .n;
      const b = (await restoredPool.query('SELECT count(*)::int AS n FROM "' + table + '"')).rows[0]
        .n;
      assert.equal(a, b);
      counts[table] = a;
    }
    const sql =
      'SELECT id,encrypted_content,encryption_iv,encryption_tag,encryption_version FROM messages ORDER BY id';
    const before = (await sourcePool.query(sql)).rows,
      after = (await restoredPool.query(sql)).rows;
    assert.ok(after.length > 0);
    assert.deepEqual(after, before);
    const decrypt = (row, secret) => {
      const cipher = createDecipheriv('aes-256-gcm', secret, row.encryption_iv);
      cipher.setAuthTag(row.encryption_tag);
      return Buffer.concat([cipher.update(row.encrypted_content), cipher.final()]);
    };
    const secret = Buffer.from(key, 'base64');
    for (const row of after) {
      assert.equal(row.encryption_version, 1);
      assert.ok(decrypt(row, secret).length > 0);
    }
    assert.throws(() => decrypt(after[0], randomBytes(32)));
    const result = {
      evidence: 'VERIFIED isolated synthetic backup/restore; not production recovery',
      version,
      source: name,
      restored: restoredName,
      counts,
      messagesDecrypted: after.length,
      wrongKeyRejected: true,
      ciphertextPreserved: true,
      archiveBytes: (await stat(dump)).size,
      sha256: createHash('sha256')
        .update(await readFile(dump))
        .digest('hex'),
      warnings: [],
      keyCustody:
        'Ephemeral synthetic test key held in process only; no real keys inspected/exported; durable production custody not verified',
    };
    await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log('Synthetic database/key restore rehearsal verified:', output);
  } finally {
    await sourcePool.end();
    await admin.end();
    await restoredPool?.end();
  }
}
