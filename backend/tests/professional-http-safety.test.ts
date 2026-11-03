/** Mocked catalogs only; this file never opens PostgreSQL. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  schemaDigest,
  verifyHttpApproval,
  verifyRetainedForHttp,
  type RetainedSchema,
} from './helpers/professional-http-safety.mjs';
import { targetName } from './helpers/professional-test-safety.mjs';
import { retainedCatalogMock } from './helpers/professional-retained-catalog.mock.js';
const snapshot: RetainedSchema = JSON.parse(
  await readFile(new URL('./fixtures/professional-retained-schema.json', import.meta.url), 'utf8'),
) as RetainedSchema;
const hash = schemaDigest(snapshot);
void test('retained HTTP approval requires exact target, schema digest and independent data-only approval', () => {
  const args = ['--target', targetName, '--schema-sha256', hash, '--approve-synthetic-http'];
  verifyHttpApproval(args, hash);
  for (const bad of [
    [],
    args.slice(0, -1),
    [...args, '--approve-migration'],
    args.map((x) => (x === targetName ? 'ordinary_application' : x)),
    args.map((x) => (x === hash ? '0'.repeat(64) : x)),
    args.map((x) => (x === '--approve-synthetic-http' ? '--approve-recovery' : x)),
  ])
    assert.throws(() => verifyHttpApproval(bad, hash));
});
const mock = (options: Parameters<typeof retainedCatalogMock>[1] = {}) =>
  retainedCatalogMock(snapshot, options);
void test('reviewed retained fingerprint accepts exact catalog and zero records using SELECT only', async () => {
  const c = mock();
  assert.deepEqual(await verifyRetainedForHttp(c, snapshot), snapshot);
  assert.equal(c.calls.length, 11);
});
for (const [name, options] of Object.entries({
  owner: { owner: 'other' },
  role: { role: 'other' },
  port: { port: 5432 },
  schema: { metadata: { ...snapshot.metadata, policies: [{ name: 'unexpected' }] } },
  publicObject: { extra: { oid: 40000, kind: 'operator', schema: 'public', name: 'unexpected' } },
  nonPublicObject: {
    extra: { oid: 40001, kind: 'relation', schema: 'pg_catalog', name: 'unexpected' },
  },
  records: { records: true },
  sessions: { sessions: 1 },
  largeObjects: { largeObjects: true },
}))
  void test('retained gate rejects ' + name + ' without repair or writes', async () => {
    await assert.rejects(() => verifyRetainedForHttp(mock(options), snapshot));
  });
