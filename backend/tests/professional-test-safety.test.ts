import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  targetName,
  verifyTarget,
  verifyApproval,
  verifyServer,
  verifyDatabaseOwner,
  verifyTemplateCatalog,
  verifyPristineTarget,
  TemplateSafetyError,
  normalizeOid,
  verifyDatabaseExistence,
  verifyNoOtherTargetSessions,
  verifyRecoveryBeforeProvisioning,
  type TemplateCatalog,
} from './helpers/professional-test-safety.mjs';
void test('professional runner requires exact independent creation/migration/hash approval', () => {
  for (const args of [
    [],
    ['--approve-create'],
    ['--approve-migration'],
    [
      '--approve-create',
      '--approve-migration',
      '--target',
      targetName,
      '--migration-sha256',
      'wrong',
    ],
  ])
    assert.throws(() => verifyApproval(args, 'expected'));
  assert.doesNotThrow(() =>
    verifyApproval(
      [
        '--approve-create',
        '--approve-migration',
        '--target',
        targetName,
        '--migration-sha256',
        'expected',
      ],
      'expected',
    ),
  );
});

const identity = {
  name: targetName,
  owner: 'postgres',
  address: '127.0.0.1',
  port: 5433,
  version: '17.11',
};
const pristine = (): TemplateCatalog => ({
  schemas: ['pg_catalog', 'information_schema', 'pg_toast', 'public'].map((name) => ({ name })),
  extensions: [{ name: 'plpgsql', schema: 'pg_catalog', version: '1.0' }],
  objects: [
    { kind: 'relation', schema: 'pg_catalog', name: 'pg_class', oid: 1259 },
    { kind: 'type', schema: 'pg_catalog', name: 'int4', oid: 23 },
    { kind: 'relation', schema: 'information_schema', name: 'tables', oid: 13000 },
    { kind: 'function', schema: 'information_schema', name: '_pg_expandarray', oid: 13001 },
    { kind: 'relation', schema: 'pg_toast', name: 'pg_toast_2618', oid: 2838 },
    {
      kind: 'function',
      schema: 'pg_catalog',
      name: 'plpgsql_call_handler',
      oid: 17000,
      extension: 'plpgsql',
      args: '',
      result: 'language_handler',
      language: 'c',
      binary: '$libdir/plpgsql',
      source: 'plpgsql_call_handler',
    },
    {
      kind: 'function',
      schema: 'pg_catalog',
      name: 'plpgsql_inline_handler',
      oid: 17002,
      extension: 'plpgsql',
      args: 'internal',
      result: 'void',
      language: 'c',
      binary: '$libdir/plpgsql',
      source: 'plpgsql_inline_handler',
    },
    {
      kind: 'function',
      schema: 'pg_catalog',
      name: 'plpgsql_validator',
      oid: 17003,
      extension: 'plpgsql',
      args: 'oid',
      result: 'void',
      language: 'c',
      binary: '$libdir/plpgsql',
      source: 'plpgsql_validator',
    },
    {
      kind: 'language',
      schema: 'pg_catalog',
      name: 'plpgsql',
      oid: 17001,
      extension: 'plpgsql',
      trusted: true,
      handler: 'plpgsql_call_handler',
      inline: 'plpgsql_inline_handler',
      validator: 'plpgsql_validator',
    },
  ],
});
void test('professional target owner is resolved and accepted only for expected database and postgres owner', () => {
  assert.doesNotThrow(() => verifyDatabaseOwner(identity));
  for (const row of [
    { ...identity, owner: 'unexpected' },
    { ...identity, name: 'other' },
    { ...identity, address: 'remote' },
    { ...identity, port: 5432 },
    { ...identity, version: '18.0' },
  ])
    assert.throws(() => verifyDatabaseOwner(row));
});
void test('standard PG17 template schemas and ordinary initialization objects are accepted', () => {
  assert.doesNotThrow(() => verifyTemplateCatalog(pristine()));
  const catalog = pristine();
  assert.doesNotThrow(() =>
    verifyTemplateCatalog({
      ...catalog,
      schemas: [...catalog.schemas, { name: 'pg_temp_3' }, { name: 'pg_toast_temp_3' }],
    }),
  );
});
void test('unknown or missing schemas are rejected even when no tables are present', () => {
  const catalog = pristine();
  for (const name of ['application', 'pg_custom', 'pg_temp_custom'])
    assert.throws(
      () => verifyTemplateCatalog({ ...catalog, schemas: [...catalog.schemas, { name }] }),
      TemplateSafetyError,
    );
  assert.throws(() =>
    verifyTemplateCatalog({
      ...catalog,
      schemas: catalog.schemas.filter((s) => s.name !== 'public'),
    }),
  );
});
for (const [kind, schema, name] of [
  ['relation', 'public', 'unexpected_table'],
  ['relation', 'pg_temp_3', 'unexpected_temp_table'],
  ['relation', 'pg_catalog', 'unexpected_system_schema_table'],
  ['function', 'public', 'unexpected_function'],
  ['function', 'pg_catalog', 'unexpected_system_function'],
  ['type', 'public', 'unexpected_type'],
  ['type', 'information_schema', 'unexpected_domain'],
  ['foreign_server', 'pg_catalog', 'unexpected_server'],
  ['event_trigger', 'pg_catalog', 'unexpected_trigger'],
] as const)
  void test(`template rejects unexpected ${kind} ${schema}.${name}`, () => {
    const catalog = pristine();
    const object = { kind, schema, name, oid: 20000 };
    assert.throws(
      () => verifyTemplateCatalog({ ...catalog, objects: [...catalog.objects, object] }),
      TemplateSafetyError,
    );
  });
for (const subtype of ['v', 'm', 'S', 'f', 'i'])
  void test(`template rejects relation kind ${subtype} regardless of schema label`, () => {
    const catalog = pristine();
    assert.throws(() =>
      verifyTemplateCatalog({
        ...catalog,
        objects: [
          ...catalog.objects,
          {
            kind: 'relation',
            schema: 'information_schema',
            name: 'unexpected',
            oid: 20001,
            subtype,
          },
        ],
      }),
    );
  });
void test('objects in public are never allowed by a low OID alone', () => {
  const catalog = pristine();
  assert.throws(() =>
    verifyTemplateCatalog({
      ...catalog,
      objects: [{ kind: 'type', schema: 'public', name: 'unexpected', oid: 100 }],
    }),
  );
});
void test('unexpected extensions, versions, or locations are rejected', () => {
  const catalog = pristine();
  for (const extensions of [
    [],
    [...catalog.extensions, { name: 'citext', schema: 'public', version: '1.6' }],
    [{ name: 'plpgsql', schema: 'public', version: '1.0' }],
    [{ name: 'plpgsql', schema: 'pg_catalog', version: 'unexpected' }],
  ])
    assert.throws(() => verifyTemplateCatalog({ ...catalog, extensions }));
});
void test('plpgsql membership and exact installed handler shape are both required', () => {
  const catalog = pristine(),
    handler = catalog.objects[5]!;
  for (const object of [
    { ...handler, extension: null },
    { ...handler, name: 'other' },
    { ...handler, source: 'other' },
    { ...handler, binary: '/other/path' },
    { ...handler, args: 'text' },
    { ...handler, result: 'text' },
    { ...handler, schema: 'public' },
    { ...handler, language: 'sql' },
  ])
    assert.throws(() =>
      verifyTemplateCatalog({
        ...catalog,
        objects: catalog.objects.map((value) => (value.name === handler.name ? object : value)),
      }),
    );
  for (const [name, args] of [
    ['plpgsql_inline_handler', 'internal'],
    ['plpgsql_validator', 'oid'],
  ] as const)
    assert.doesNotThrow(() =>
      verifyTemplateCatalog({
        ...catalog,
        objects: catalog.objects.map((object) =>
          object.name === name ? { ...handler, name, args, result: 'void', source: name } : object,
        ),
      }),
    );
});

function mockedCatalog(owner = identity.owner, catalog = pristine(), otherSessions = 0) {
  const statements: string[] = [];
  return {
    statements,
    client: {
      query(sql: string) {
        statements.push(sql);
        if (sql.includes('pg_stat_clear_snapshot()')) return Promise.resolve({ rows: [] });
        if (sql.includes('AS unexpected_records'))
          return Promise.resolve({ rows: [{ unexpected_records: false }] });
        if (sql.includes('AS other_sessions'))
          return Promise.resolve({ rows: [{ other_sessions: otherSessions }] });
        if (sql.startsWith('LOCK TABLE')) return Promise.resolve({ rows: [] });
        if (sql.includes('pg_database')) return Promise.resolve({ rows: [{ ...identity, owner }] });
        if (sql.includes('SELECT nspname')) return Promise.resolve({ rows: catalog.schemas });
        if (sql.includes('SELECT e.extname')) return Promise.resolve({ rows: catalog.extensions });
        if (sql.includes('WITH objects'))
          return Promise.resolve({ rows: catalog.objects.map((object) => ({ object })) });
        throw new Error('Unexpected SQL in safety check');
      },
    },
  };
}
void test('authoritative catalog owner check fails before inspecting or provisioning anything', async () => {
  const mock = mockedCatalog('other');
  let provisioned = false;
  await assert.rejects(async () => {
    await verifyPristineTarget(mock.client);
    provisioned = true;
  }, TemplateSafetyError);
  assert.equal(provisioned, false);
  assert.equal(mock.statements.length, 1);
  assert.match(mock.statements[0]!, /pg_catalog\.pg_database/);
  assert.match(mock.statements[0]!, /JOIN pg_catalog\.pg_roles r ON r\.oid = d\.datdba/);
});

void test('OID normalization accepts integer and actual PostgreSQL JSON decimal-string representations', () => {
  assert.equal(normalizeOid(1259), 1259);
  // Captured Step 13B.8C PostgreSQL result; do not change this to a numeric fixture.
  const reported = JSON.parse('{"oid":"1259","name":"pg_class"}') as { oid: unknown; name: string };
  assert.equal(typeof reported.oid, 'string');
  assert.equal(normalizeOid(reported.oid), 1259);
  for (const value of [0, '0', 4294967295, '4294967295'])
    assert.equal(normalizeOid(value), Number(value));
  const catalog = pristine();
  const stringCatalog = {
    ...catalog,
    objects: catalog.objects.map((object) => ({ ...object, oid: String(object.oid) })),
  };
  assert.doesNotThrow(() => verifyTemplateCatalog(stringCatalog));
});
for (const [name, value] of [
  ['null', null],
  ['undefined', undefined],
  ['boolean', true],
  ['empty', ''],
  ['blank', ' '],
  ['leading whitespace', ' 1259'],
  ['trailing whitespace', '1259 '],
  ['fraction', 1.5],
  ['negative', -1],
  ['negative zero', -0],
  ['negative string', '-1'],
  ['negative-zero string', '-0'],
  ['nonnumeric', 'not-an-oid'],
  ['trailing text', '1259extra'],
  ['exponent', '1e3'],
  ['hex', '0x4eb'],
  ['leading zero', '01259'],
  ['plus sign', '+1259'],
  ['decimal fraction', '1259.0'],
  ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ['unsafe string', '9007199254740992'],
  ['range overflow', 4294967296],
  ['range overflow string', '4294967296'],
  ['NaN', NaN],
  ['Infinity', Infinity],
] as const)
  void test(`OID normalization rejects ${name}`, () =>
    assert.throws(() => normalizeOid(value), TemplateSafetyError));

void test('normalizing an OID cannot admit user objects or invalid extension member OIDs', () => {
  const catalog = pristine();
  for (const object of [
    { kind: 'relation', schema: 'pg_catalog', name: 'user_table', oid: '16384' },
    { kind: 'type', schema: 'public', name: 'user_type', oid: '1259' },
    { ...catalog.objects[5]!, oid: null },
    { ...catalog.objects[5]!, oid: '0' },
  ])
    assert.throws(() =>
      verifyTemplateCatalog({ ...catalog, objects: [...catalog.objects, object] }),
    );
});
void test('zero is a valid representation but never a valid catalog object, including extension members', () => {
  const catalog = pristine();
  for (const oid of [0, '0', null])
    assert.throws(() =>
      verifyTemplateCatalog({
        ...catalog,
        objects: catalog.objects.map((object, index) =>
          index === 5 ? { ...object, oid } : object,
        ),
      }),
    );
});

const recoveryArgs = [
  '--target',
  targetName,
  '--migration-sha256',
  'reviewed',
  '--approve-migration',
  '--recover-untouched',
  '--approve-recovery',
];
void test('default execution still refuses an existing target; recovery is exact, explicit and independently approved', () => {
  assert.throws(() => verifyDatabaseExistence(true, 'create'));
  assert.doesNotThrow(() => verifyDatabaseExistence(false, 'create'));
  assert.equal(verifyApproval(recoveryArgs, 'reviewed'), 'recover');
  assert.doesNotThrow(() => verifyDatabaseExistence(true, 'recover'));
  assert.throws(() => verifyDatabaseExistence(false, 'recover'));
  for (const args of [
    recoveryArgs.filter((a) => a !== '--approve-recovery'),
    recoveryArgs.filter((a) => a !== '--recover-untouched'),
    recoveryArgs.filter((a) => a !== '--approve-migration'),
    [...recoveryArgs, '--approve-create'],
    [...recoveryArgs, '--allow-existing'],
    [...recoveryArgs, '--target', targetName],
    recoveryArgs.map((a) => (a === targetName ? 'another_database' : a)),
  ])
    assert.throws(() => verifyApproval(args, 'reviewed'));
  assert.throws(() => verifyApproval(recoveryArgs, 'different SQL hash'));
});
void test('recovery refuses an unexpected owner before migration execution', async () => {
  const mock = mockedCatalog('other');
  let provisioned = false;
  await assert.rejects(async () => {
    await verifyRecoveryBeforeProvisioning(mock.client);
    provisioned = true;
  });
  assert.equal(provisioned, false);
  assert.ok(
    !mock.statements.some((s) => /^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(s)),
  );
});
for (const [label, additional] of [
  [
    'partial migration table',
    { kind: 'relation', schema: 'public', name: 'professional_profiles', oid: '20000' },
  ],
  ['application table', { kind: 'relation', schema: 'public', name: 'users', oid: '20001' }],
  [
    'custom function',
    { kind: 'function', schema: 'pg_catalog', name: 'user_function', oid: '20002' },
  ],
  ['custom type', { kind: 'type', schema: 'public', name: 'user_type', oid: '20003' }],
] as const)
  void test(`recovery refuses ${label} rather than cleaning or provisioning`, async () => {
    const catalog = pristine(),
      mock = mockedCatalog('postgres', { ...catalog, objects: [...catalog.objects, additional] });
    let provisioned = false;
    await assert.rejects(async () => {
      await verifyRecoveryBeforeProvisioning(mock.client);
      provisioned = true;
    }, TemplateSafetyError);
    assert.equal(provisioned, false);
    assert.ok(
      mock.statements.every((s) => !/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(s)),
    );
  });
void test('recovery refuses extra schemas or a previously installed citext extension', async () => {
  const catalog = pristine();
  for (const changed of [
    { ...catalog, schemas: [...catalog.schemas, { name: 'extra' }] },
    {
      ...catalog,
      extensions: [...catalog.extensions, { name: 'citext', schema: 'public', version: '1.6' }],
    },
  ]) {
    const mock = mockedCatalog('postgres', changed);
    await assert.rejects(verifyRecoveryBeforeProvisioning(mock.client));
  }
});
void test('recovery refuses another session before acquiring metadata locks; no client is disconnected', async () => {
  const mock = mockedCatalog('postgres', pristine(), 1);
  await assert.rejects(verifyRecoveryBeforeProvisioning(mock.client), TemplateSafetyError);
  assert.equal(mock.statements.length, 2);
  await assert.rejects(verifyNoOtherTargetSessions(mock.client), TemplateSafetyError);
});
void test('recovery lock contention fails before template or provisioning SQL and is not retried', async () => {
  const mock = mockedCatalog();
  const original = (sql: string) => mock.client.query(sql);
  const client = {
    query(sql: string) {
      if (sql.startsWith('LOCK TABLE')) {
        mock.statements.push(sql);
        return Promise.reject(new Error('Synthetic lock conflict'));
      }
      return original(sql);
    },
  };
  await assert.rejects(verifyRecoveryBeforeProvisioning(client));
  assert.equal(mock.statements.length, 3);
});
void test('a session arriving during recovery lock acquisition stops the second gate', async () => {
  const mock = mockedCatalog();
  let sessionChecks = 0;
  const original = (sql: string) => mock.client.query(sql);
  const client = {
    query(sql: string) {
      if (sql.includes('AS other_sessions')) {
        mock.statements.push(sql);
        return Promise.resolve({ rows: [{ other_sessions: sessionChecks++ }] });
      }
      return original(sql);
    },
  };
  await assert.rejects(verifyRecoveryBeforeProvisioning(client), TemplateSafetyError);
  assert.equal(mock.statements.length, 5);
});
void test('recovery rejects standalone large-object records without attempting deletion', async () => {
  const mock = mockedCatalog();
  const original = (sql: string) => mock.client.query(sql);
  const client = {
    query(sql: string) {
      if (sql.includes('AS unexpected_records')) {
        mock.statements.push(sql);
        return Promise.resolve({ rows: [{ unexpected_records: true }] });
      }
      return original(sql);
    },
  };
  await assert.rejects(verifyRecoveryBeforeProvisioning(client), TemplateSafetyError);
  assert.ok(
    mock.statements.every((s) => !/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(s)),
  );
});
void test('recovery rechecks template while catalog locks are held and does not change or remove objects', async () => {
  const catalog = pristine(),
    mock = mockedCatalog('postgres', {
      ...catalog,
      objects: catalog.objects.map((object) => ({ ...object, oid: String(object.oid) })),
    });
  await verifyRecoveryBeforeProvisioning(mock.client);
  assert.ok(mock.statements[0]!.includes('pg_stat_clear_snapshot()'));
  assert.ok(mock.statements[3]!.includes('pg_stat_clear_snapshot()'));
  assert.ok(mock.statements[2]!.includes('IN SHARE MODE NOWAIT'));
  assert.ok(mock.statements[2]!.includes('pg_catalog.pg_namespace'));
  assert.ok(!mock.statements[2]!.includes('pg_catalog.pg_subscription'));
  assert.ok(mock.statements[4]!.includes('AS other_sessions'));
  assert.ok(mock.statements[5]!.includes('pg_database'));
  assert.equal(mock.statements.length, 10);
  assert.ok(
    mock.statements.every((s) => !/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(s)),
  );
});
void test('runner recovery stays inside existing concurrency/hash/transaction and cleanup safeguards', async () => {
  const source = await readFile(
    new URL('./run-professional-postgres.mjs', import.meta.url),
    'utf8',
  );
  const begin = source.indexOf("await db.query('BEGIN')"),
    guard = source.indexOf('await verifyRecoveryBeforeProvisioning(db)'),
    create = source.indexOf("await db.query('CREATE EXTENSION citext')");
  assert.ok(source.includes("if (mode === 'create') await admin.query(`CREATE DATABASE"));
  assert.ok(source.includes('verifyDatabaseExistence(exists, mode)'));
  assert.ok(source.indexOf('pg_try_advisory_lock') < guard);
  assert.ok(source.includes('sqlHash(bytes) !== expected'));
  assert.ok(begin < guard && guard < create);
  assert.ok(
    source.lastIndexOf('await verifyNoOtherTargetSessions(db)') <
      source.indexOf("await db.query('COMMIT')"),
  );
  assert.ok(source.includes("await db.query('ROLLBACK')"));
  assert.ok(!/DROP DATABASE|TRUNCATE|pg_terminate_backend/i.test(source));
  assert.ok(source.includes('pg_advisory_unlock'));
  const suite = await readFile(new URL('./professional-postgres.test.ts', import.meta.url), 'utf8');
  assert.ok(suite.includes('await identity();'));
  assert.ok(suite.includes('DELETE FROM public.users WHERE id=ANY($1::uuid[])'));
});
void test('template object failure prevents provisioning and returns diagnostic names only', async () => {
  const catalog = pristine();
  const mock = mockedCatalog('postgres', {
    ...catalog,
    objects: [
      ...catalog.objects,
      { kind: 'relation', schema: 'pg_catalog', name: 'unexpected_view', oid: 20000 },
    ],
  });
  let provisioned = false;
  await assert.rejects(
    async () => {
      await verifyPristineTarget(mock.client);
      provisioned = true;
    },
    (error: unknown) =>
      error instanceof TemplateSafetyError &&
      error.unexpected.some((s) => s.includes('unexpected_view')),
  );
  assert.equal(provisioned, false);
  assert.ok(
    mock.statements.every((s) => !/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|BEGIN)\b/i.test(s)),
  );
});
void test('valid catalogs allow provisioning only after all four read-only queries finish', async () => {
  const mock = mockedCatalog();
  await verifyPristineTarget(mock.client);
  assert.equal(mock.statements.length, 4);
});
void test('runner wires the catalog gate before its first provisioning transaction', async () => {
  const source = await readFile(
    new URL('./run-professional-postgres.mjs', import.meta.url),
    'utf8',
  );
  const gate = source.indexOf('await verifyPristineTarget(db)');
  assert.ok(gate > source.indexOf('await db.connect()'));
  assert.ok(gate < source.indexOf("await db.query('BEGIN')"));
  assert.ok(gate < source.indexOf("await db.query('CREATE EXTENSION citext')"));
  assert.ok(gate < source.indexOf('await db.query(proposed.toString'));
});
void test('professional runner refuses production URLs, wrong ports/names and connection overrides', () => {
  const safe = `postgresql://postgres:synthetic@127.0.0.1:5433/${targetName}`;
  assert.equal(verifyTarget(safe).hostname, '127.0.0.1');
  for (const value of [
    undefined,
    safe.replace('127.0.0.1', 'db.example.test'),
    safe.replace('5433', '5432'),
    safe.replace(targetName, 'postgres'),
    safe + '?service=other',
    safe + '#override',
  ])
    assert.throws(() => verifyTarget(value));
  assert.doesNotThrow(() => verifyServer({ address: '127.0.0.1', port: 5433, version: '17.11' }));
  for (const row of [
    { address: 'remote', port: 5433, version: '17.11' },
    { address: '127.0.0.1', port: 5432, version: '17.11' },
    { address: '127.0.0.1', port: 5433, version: '18.0' },
  ])
    assert.throws(() => verifyServer(row));
});
