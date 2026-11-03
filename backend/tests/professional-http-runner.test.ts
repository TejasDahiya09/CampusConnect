/** Source-only: injected connection responses, never pg sockets. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runTargetHttp, targetHttpConnection } from './helpers/professional-http-runner.mjs';
import {
  verifyHttpSessions,
  cleanupHttpRecords,
  verifyMigrationFiles,
  schemaDigest,
  type RetainedSchema,
} from './helpers/professional-http-safety.mjs';
import { retainedCatalogMock } from './helpers/professional-retained-catalog.mock.js';
import { targetName } from './helpers/professional-test-safety.mjs';
import { createProfessionalHttpPlan } from './helpers/professional-http-plan.js';
const raw = 'postgresql://postgres:synthetic@127.0.0.1:5433/' + targetName;
const application = 'cc-prof-http-11111111-1111-4111-8111-111111111111';
const parent = { pid: 1234, started: '2026-11-01 00:00:00+00', application };
const identity = {
  ...parent,
  name: targetName,
  owner: 'postgres',
  role: 'postgres',
  session_role: 'postgres',
  address: '127.0.0.1',
  port: 5433,
  version: '17.11',
};
const session = { ...parent, name: targetName, role: 'postgres', address: '127.0.0.1', held: true };
const snapshot = JSON.parse(
  await readFile(new URL('./fixtures/professional-retained-schema.json', import.meta.url), 'utf8'),
) as RetainedSchema;
function lifecycle(
  options: {
    lock?: boolean;
    held?: boolean;
    identity?: Record<string, unknown>;
    failure?: 'preflight' | 'child' | 'postflight';
  } = {},
) {
  const events: string[] = [];
  let held = false,
    verifications = 0,
    children = 0;
  const client = {
    connect: () => {
      events.push('connect');
      return Promise.resolve();
    },
    end: () => {
      events.push('end');
      return Promise.resolve();
    },
    query: (sql: string) => {
      assert.ok(
        !/\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i.test(sql),
        'Lock lifecycle may only read catalogs and manage its advisory lock.',
      );
      if (sql.includes('pg_try_advisory_lock')) {
        events.push('lock');
        held = options.lock ?? true;
        return Promise.resolve({ rows: [{ locked: held }] });
      }
      if (sql.includes('pg_advisory_unlock')) {
        events.push('unlock');
        const released = held;
        held = false;
        return Promise.resolve({ rows: [{ released }] });
      }
      if (sql.includes('pg_locks')) {
        events.push('held');
        return Promise.resolve({ rows: [{ held: options.held ?? held }] });
      }
      events.push('identity');
      return Promise.resolve({ rows: [options.identity ?? identity] });
    },
  };
  return {
    events,
    run: () =>
      runTargetHttp({
        raw,
        application,
        snapshot,
        createClient: (config) => {
          assert.equal(new URL(config.connectionString).pathname, '/' + targetName);
          return client;
        },
        verify: () => {
          verifications++;
          events.push('verify');
          assert.ok(held);
          if (
            (verifications === 1 && options.failure === 'preflight') ||
            (verifications === 2 && options.failure === 'postflight')
          )
            return Promise.reject(new Error('Synthetic schema or record gate failure'));
          return Promise.resolve();
        },
        runChild: (actual) => {
          children++;
          events.push('child');
          assert.deepEqual(actual, parent);
          assert.ok(held, 'Lock must cover child writes and cleanup');
          if (options.failure === 'child')
            return Promise.reject(new Error('Synthetic child failure'));
          return Promise.resolve(0);
        },
      }),
    children: () => children,
    held: () => held,
  };
}
void test('all HTTP connection modes preserve exact target and never use maintenance selection', () => {
  for (const readOnly of [true, false]) {
    const config = targetHttpConnection(raw, application, readOnly);
    const url = new URL(config.connectionString);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '5433');
    assert.equal(url.pathname, '/' + targetName);
    assert.equal(url.search, '');
    assert.equal(config.application_name, application);
    assert.equal(config.options.includes('default_transaction_read_only=on'), readOnly);
  }
  for (const bad of [
    undefined,
    raw.replace(targetName, 'postgres'),
    raw.replace('5433', '5432'),
    raw.replace('127.0.0.1', 'localhost'),
    raw + '?options=unsafe',
  ])
    assert.throws(() => targetHttpConnection(bad, application));
});
void test('actual runner and ORM wiring use only shared allowlisted options with no maintenance URL', async () => {
  const entry = await readFile(
    new URL('./run-professional-http-postgres.mjs', import.meta.url),
    'utf8',
  );
  const child = await readFile(
    new URL('./professional-http-postgres.integration.ts', import.meta.url),
    'utf8',
  );
  assert.ok(!entry.includes("'/postgres'") && !child.includes("datname='postgres'"));
  assert.match(entry, /createClient:\s*\(?options\)?\s*=>\s*new Client\(options\)/);
  assert.match(child, /new Pool\(\{\s*\.\.\.config,/);
  assert.match(child, /new PrismaPg\(\{\s*\.\.\.config,/);
  assert.ok(
    !/\b(?:CREATE DATABASE|DROP DATABASE|TRUNCATE|ALTER TABLE|CREATE TABLE)\b/i.test(entry + child),
  );
});
void test('lock remains held throughout child and final checks, then releases and closes', async () => {
  const c = lifecycle();
  assert.equal(await c.run(), 0);
  assert.deepEqual(c.events, [
    'connect',
    'identity',
    'lock',
    'verify',
    'held',
    'child',
    'verify',
    'unlock',
    'end',
  ]);
  assert.equal(c.children(), 1);
  assert.equal(c.held(), false);
});
void test('conflicting target advisory lock blocks child and never unlocks another session', async () => {
  const c = lifecycle({ lock: false });
  await assert.rejects(c.run, /conflicting/);
  assert.equal(c.children(), 0);
  assert.deepEqual(c.events, ['connect', 'identity', 'lock', 'end']);
});
void test('wrong database identity stops before lock or writes', async () => {
  const c = lifecycle({ identity: { ...identity, name: 'other_database' } });
  await assert.rejects(c.run);
  assert.equal(c.children(), 0);
  assert.deepEqual(c.events, ['connect', 'identity', 'end']);
});
void test('lost lock blocks child writes and closes its connection', async () => {
  const c = lifecycle({ held: false });
  await assert.rejects(c.run, /lost/);
  assert.equal(c.children(), 0);
  assert.equal(c.held(), false);
  assert.equal(c.events.at(-1), 'end');
});
for (const failure of ['preflight', 'child', 'postflight'] as const)
  void test(failure + ' failure releases lock without repair or retry', async () => {
    const c = lifecycle({ failure });
    await assert.rejects(c.run);
    assert.equal(c.children(), failure === 'preflight' ? 0 : 1);
    assert.equal(c.held(), false);
    assert.deepEqual(c.events.slice(-2), ['unlock', 'end']);
  });
function sessions(rows: Record<string, unknown>[]) {
  let index = 0;
  return {
    query: (sql: string) => {
      assert.match(sql.trim(), /^SELECT/);
      return Promise.resolve({ rows: index++ === 0 ? [] : rows });
    },
  };
}
void test('own pool session is excluded by backend PID; only verified locked parent is accepted', async () => {
  await verifyHttpSessions(sessions([session]), parent);
});
for (const [name, rows] of Object.entries({
  external: [session, { ...session, pid: 4321 }],
  missing: [],
  unlocked: [{ ...session, held: false }],
  reusedPid: [{ ...session, started: 'different' }],
  wrongRole: [{ ...session, role: 'other' }],
  wrongTarget: [{ ...session, name: 'other' }],
  wrongApplication: [{ ...session, application: 'other' }],
  wrongAddress: [{ ...session, address: '::1' }],
}))
  void test('target session guard rejects ' + name, async () => {
    await assert.rejects(() => verifyHttpSessions(sessions(rows), parent));
  });
function queued(rows: readonly (readonly Record<string, unknown>[])[]) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  return {
    calls,
    query: (sql: string, values?: unknown[]) => {
      calls.push({ sql, ...(values ? { values } : {}) });
      const result = rows[calls.length - 1];
      assert.ok(result, 'Unexpected safety query');
      return Promise.resolve({ rows: result });
    },
  };
}
const owned = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
void test('cleanup revalidates schema/session and deletes only successfully tracked UUIDs', async () => {
  const schema = retainedCatalogMock(snapshot).responses.slice(0, 6);
  const tail = retainedCatalogMock(snapshot).responses.slice(8);
  const recordChecks = Array.from({ length: 13 }, () => [{ unexpected: false }]);
  const c = queued([
    ...schema,
    [],
    [session],
    ...recordChecks,
    [],
    ...schema,
    [],
    [session],
    ...tail,
  ]);
  await cleanupHttpRecords(c, snapshot, parent, owned);
  const writes = c.calls.filter((call) => call.sql.trim().startsWith('DELETE'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.sql, 'DELETE FROM public.users WHERE id=ANY($1::uuid[])');
  assert.deepEqual(writes[0]!.values, [owned]);
  assert.ok(
    c.calls.every((call) =>
      /^(?:SELECT|WITH|DELETE FROM public.users WHERE id=ANY)/.test(call.sql.trim()),
    ),
  );
});
void test('cleanup refuses untrusted IDs before queries', async () => {
  const c = queued([]);
  await assert.rejects(() => cleanupHttpRecords(c, snapshot, parent, ['not-a-uuid']));
  assert.equal(c.calls.length, 0);
});
for (const defect of ['schema', 'session'] as const)
  void test('cleanup refuses ' + defect + ' mismatch without deleting', async () => {
    const schema = retainedCatalogMock(
      snapshot,
      defect === 'schema' ? { metadata: { unexpected: true } } : {},
    ).responses.slice(0, 6);
    const c = queued([...schema, [], [{ ...session, held: false }]]);
    await assert.rejects(() => cleanupHttpRecords(c, snapshot, parent, owned));
    assert.ok(c.calls.every((call) => !call.sql.startsWith('DELETE')));
  });
void test('live gate rejects unexpected records before any write callback', async () => {
  const c = retainedCatalogMock(snapshot, { records: true });
  const { verifyRetainedForHttp } = await import('./helpers/professional-http-safety.mjs');
  let wrote = false;
  await assert.rejects(async () => {
    await verifyRetainedForHttp(c, snapshot);
    wrote = true;
  });
  assert.equal(wrote, false);
  assert.ok(c.calls.every((sql) => /^(SELECT|WITH)/.test(sql.trim())));
});
void test('ten actual behaviors are registered once, excluding parent/setup and including confidentiality', async () => {
  let disabled = 0,
    failure = 0;
  const plan = createProfessionalHttpPlan(
    {
      base: 'http://127.0.0.1:1',
      owner: owned[0]!,
      other: owned[1]!,
      token: () => Promise.resolve('synthetic'),
      setStatus: () => Promise.resolve(),
      stored: () => Promise.resolve(null),
    },
    {
      disabledStorage: () => {
        disabled++;
        return Promise.resolve();
      },
      storageFailure: () => {
        failure++;
        return Promise.resolve();
      },
    },
  );
  assert.equal(plan.length, 10);
  assert.equal(new Set(plan.map((c) => c.name)).size, 10);
  assert.ok(plan.every((c) => !/(parent|setup|container)/i.test(c.name)));
  assert.match(plan[9]!.name, /storage failure/);
  await plan[8]!.run();
  await plan[9]!.run();
  assert.equal(disabled, 1);
  assert.equal(failure, 1);
});
void test('all seven reviewed migrations and stored schema fixture digest are unchanged', async () => {
  await verifyMigrationFiles(new URL('../prisma/migrations/', import.meta.url));
  assert.equal(
    schemaDigest(snapshot),
    'f740d00108fe0ba6716cef050c0f209f831b2261bd17234aa38a139a3e2289ee',
  );
});

void test('cleanup refuses unrelated application records, including records attached to owned users', async () => {
  const schema = retainedCatalogMock(snapshot).responses.slice(0, 6);
  const c = queued([...schema, [], [session], [{ unexpected: true }]]);
  await assert.rejects(() => cleanupHttpRecords(c, snapshot, parent, owned), /Unexpected records/);
  assert.ok(c.calls.every((call) => !call.sql.startsWith('DELETE')));
});
