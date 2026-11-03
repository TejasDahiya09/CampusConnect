/** PREPARED ONLY. Ten behaviors, excluding parent. Never auto-discovered as *.test.ts. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type AccountStatus } from '../src/generated/prisma/client.js';
import { createAuthUserLookup } from '../src/modules/auth/auth.repository.js';
import { createProfileReadRepository } from '../src/modules/profile/profile.repository.js';
import { createProfessionalStore } from '../src/modules/profile/professional-profile.js';
import {
  schemaDigest,
  verifyMigrationFiles,
  validateParent,
  readHttpConnectionIdentity,
  verifyRetainedForHttp,
  cleanupHttpRecords,
  type RetainedSchema,
} from './helpers/professional-http-safety.mjs';
import { targetHttpConnection } from './helpers/professional-http-runner.mjs';
import { createProfessionalHttpFixture } from './helpers/professional-http-app.js';
import { createProfessionalHttpPlan } from './helpers/professional-http-plan.js';
import { runStorageFailureConfidentiality } from './helpers/professional-http-confidentiality.js';
import { withTestServer } from './helpers/test-server.js';
const snapshot: RetainedSchema = JSON.parse(
  await readFile(new URL('./fixtures/professional-retained-schema.json', import.meta.url), 'utf8'),
) as RetainedSchema;
assert.equal(
  process.env.PROFESSIONAL_HTTP_APPROVED_SCHEMA,
  schemaDigest(snapshot),
  'Separate retained-target HTTP execution approval required.',
);
const parent = {
  pid: Number(process.env.PROFESSIONAL_HTTP_RUNNER_PID),
  started: process.env.PROFESSIONAL_HTTP_RUNNER_STARTED ?? '',
  application: process.env.PROFESSIONAL_HTTP_RUNNER_APPLICATION ?? '',
};
validateParent(parent);
await verifyMigrationFiles(new URL('../prisma/migrations/', import.meta.url));
assert.equal(process.env.DATABASE_URL, 'postgresql://unused:unused@127.0.0.1:1/unused');
assert.notEqual(process.env.PROFILE_PROFESSIONAL_STORAGE_READY, 'true');
const config = targetHttpConnection(
  process.env.PROFESSIONAL_HTTP_TEST_DATABASE_URL,
  parent.application,
  false,
);
const pool = new Pool({ ...config, max: 1 });
let db: PrismaClient | null = null;
const ids: string[] = [];
let ready = false;
void test('retained PostgreSQL + controlled-auth real HTTP integration (parent, not a behavior)', async (t) => {
  try {
    await readHttpConnectionIdentity(pool);
    await verifyRetainedForHttp(pool, snapshot, parent);
    ready = true;
    for (let i = 0; i < 2; i++) {
      const id = randomUUID();
      const inserted = await pool.query<{ id: string }>(
        'INSERT INTO public.users(id,email) VALUES($1,$2) RETURNING id',
        [id, id + '@example.test'],
      );
      assert.equal(inserted.rows[0]?.id, id);
      ids.push(id); // Track only successfully inserted invocation-owned users.
      await pool.query(
        "INSERT INTO public.profiles(user_id,full_name) VALUES($1,'Synthetic HTTP student')",
        [id],
      );
    }
    // ORM is lazy and starts only after the quiescent pre-write safety gate.
    db = new PrismaClient({ adapter: new PrismaPg({ ...config, max: 1 }) });
    const client = db;
    await readHttpConnectionIdentity({
      query: async (sql) => ({
        rows: await client.$queryRawUnsafe<Record<string, unknown>[]>(sql),
      }),
    });
    const owner = ids[0]!,
      other = ids[1]!;
    const options = {
      users: createAuthUserLookup(client),
      profiles: createProfileReadRepository(client),
    };
    const fixture = createProfessionalHttpFixture({
      ...options,
      store: createProfessionalStore(client),
    });
    const disabledStorage = async () => {
      let professionalCalls = 0;
      const disabled = createProfessionalHttpFixture({
        ...options,
        ready: false,
        store: {
          read: () => {
            professionalCalls++;
            return Promise.reject(new Error('Forbidden disabled read'));
          },
          write: () => {
            professionalCalls++;
            return Promise.reject(new Error('Forbidden disabled write'));
          },
        },
      });
      await withTestServer(disabled.app, async (base) => {
        const headers = {
          authorization: `Bearer ${await disabled.token(owner)}`,
          'content-type': 'application/json',
        };
        const response = await fetch(base + '/api/profile/me/professional', { headers });
        assert.equal(response.status, 200);
        assert.deepEqual(
          ((await response.json()) as { data: { professional: unknown } }).data.professional,
          { available: false, details: null, version: null },
        );
        assert.equal(
          (
            await fetch(base + '/api/profile/me/professional', {
              method: 'PUT',
              headers,
              body: '{}',
            })
          ).status,
          503,
        );
        assert.equal(professionalCalls, 0);
      });
    };
    await withTestServer(fixture.app, async (base) => {
      const plan = createProfessionalHttpPlan(
        {
          base,
          owner,
          other,
          token: fixture.token,
          setStatus: async (id: string, status: AccountStatus) => {
            await client.user.update({ where: { id }, data: { status } });
          },
          stored: async (id) => {
            const row = await client.professionalProfile.findUnique({
              where: { userId: id },
              select: { details: true },
            });
            return row?.details ?? null;
          },
        },
        {
          disabledStorage,
          storageFailure: () => runStorageFailureConfidentiality(client, options, owner),
        },
      );
      assert.equal(plan.length, 10, 'Count behaviors only, never parent containers.');
      for (const scenario of plan) {
        let failed = false;
        await t.test(scenario.name, async () => {
          try {
            await scenario.run();
          } catch {
            failed = true;
            throw new Error(
              'HTTP behavior failed; private payloads suppressed. Inspect the isolated target before retrying.',
            );
          }
        });
        if (failed)
          throw new Error('Stopping after first failed behavior; only guarded cleanup follows.');
      }
    });
  } finally {
    try {
      await db?.$disconnect();
    } finally {
      try {
        if (ready) await cleanupHttpRecords(pool, snapshot, parent, ids);
      } finally {
        await pool.end();
      }
    }
  }
});
