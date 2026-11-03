/** PREPARED ONLY: requires separately approved runner. Never falls back to application DATABASE_URL. */
import assert from 'node:assert/strict';
import express from 'express';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { before, after, test, type TestContext } from 'node:test';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  createProfessionalStore,
  createProfessionalRouter,
  professionalVersion,
  parseProfessionalDetails,
} from '../src/modules/profile/professional-profile.js';
import { createProfileService } from '../src/modules/profile/profile.service.js';
import { profileRepository } from '../src/modules/profile/profile.repository.js';
import {
  verifyTarget,
  verifyServer,
  targetName,
  sqlHash,
} from './helpers/professional-test-safety.mjs';
const raw = process.env.PROFESSIONAL_TEST_DATABASE_URL;
const enabled = !!raw && !!process.env.PROFESSIONAL_TEST_APPROVED_HASH;
if (raw) verifyTarget(raw);
const pool = enabled ? new Pool({ connectionString: raw }) : null;
const db = enabled
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: raw }), log: ['error'] })
  : null;
const store = db ? createProfessionalStore(db) : null;
const ids: string[] = [];
let suiteReady = false;
const empty = { headline: null, education: [], experience: [] };
const sample = {
  headline: 'Synthetic student',
  education: [{ institution: 'Synthetic College', qualification: '' }],
  experience: [{ role: 'Contributor', organization: '', description: 'Synthetic text' }],
};
const check = (name: string, run: (t: TestContext) => Promise<void>) =>
  test(name, { skip: !enabled }, run);
const identity = async () => {
  const row = (
    await pool!.query(
      "SELECT current_database() AS name,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version') AS version",
    )
  ).rows[0] as { name: string; address: string; port: number; version: string };
  verifyServer(row);
  assert.equal(row.name, targetName);
};
before(async () => {
  if (!enabled) return;
  assert.equal(
    process.env.PROFESSIONAL_TEST_APPROVED_HASH,
    sqlHash(
      await readFile(
        new URL(
          '../prisma/migrations/20261101020000_native_professional_details/migration.sql',
          import.meta.url,
        ),
      ),
    ),
  );
  await identity();
  const tables = (
    await pool!.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    )
  ).rows;
  for (const { tablename } of tables) {
    const count = await pool!.query<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM public."${tablename.replaceAll('"', '""')}") AS present`,
    );
    assert.equal(
      count.rows[0]!.present,
      false,
      'Refusing a database containing preexisting records.',
    );
  }
  suiteReady = true;
});
after(async () => {
  try {
    if (suiteReady) {
      await identity();
      await pool!.query('DELETE FROM public.users WHERE id=ANY($1::uuid[])', [ids]);
    }
  } finally {
    await db?.$disconnect();
    await pool?.end();
  }
});
async function user() {
  const id = randomUUID();
  ids.push(id);
  await pool!.query('INSERT INTO users(id,email) VALUES($1,$2)', [id, id + '@example.test']);
  await pool!.query(
    "INSERT INTO profiles(user_id,full_name) VALUES($1,'Synthetic professional test')",
    [id],
  );
  return id;
}
async function saved() {
  const id = await user();
  assert.equal(await store!.write(id, sample, professionalVersion(null)), true);
  return id;
}
void check(
  'PostgreSQL professional: migration columns constraints index and RLS catalog',
  async () => {
    const cols = (
      await pool!.query(
        "SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='professional_profiles' ORDER BY ordinal_position",
      )
    ).rows;
    assert.deepEqual(cols, [
      { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'details', data_type: 'jsonb', is_nullable: 'NO' },
    ]);
    const constraints = (
      await pool!.query<{ contype: string; conname: string; definition: string }>(
        "SELECT contype,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.professional_profiles'::regclass",
      )
    ).rows;
    assert.equal(constraints.filter((r) => r.contype === 'c').length, 5);
    assert.equal(constraints.filter((r) => r.contype === 'p').length, 1);
    assert.equal(constraints.filter((r) => r.contype === 'f').length, 1);
    assert.deepEqual(
      constraints.map((r) => r.conname).sort(),
      [
        'professional_profiles_pkey',
        'professional_profiles_user_id_fkey',
        'professional_profiles_details_object_check',
        'professional_profiles_keys_check',
        'professional_profiles_headline_check',
        'professional_profiles_education_check',
        'professional_profiles_experience_check',
      ].sort(),
    );
    assert.match(
      constraints.find((r) => r.contype === 'f')!.definition,
      /REFERENCES users\(id\) ON DELETE CASCADE/,
    );
    assert.ok(
      constraints.filter((r) => r.contype === 'c').every((r) => r.definition.startsWith('CHECK')),
    );
    const policies = await pool!.query(
      "SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='professional_profiles'",
    );
    assert.equal(policies.rowCount, 0);

    assert.equal(
      (
        await pool!.query<{ relrowsecurity: boolean }>(
          "SELECT relrowsecurity FROM pg_class WHERE oid='public.professional_profiles'::regclass",
        )
      ).rows[0]!.relrowsecurity,
      true,
    );
    assert.equal(
      (
        await pool!.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND tablename='professional_profiles'",
        )
      ).rows[0]!.n,
      1,
    );
  },
);
void check('PostgreSQL professional: create and retrieve', async () => {
  const id = await saved();
  assert.deepEqual(await store!.read(id), sample);
});
void check('PostgreSQL professional: update and retrieve', async () => {
  const id = await saved();
  const next = { ...sample, headline: 'Updated' };
  assert.equal(await store!.write(id, next, professionalVersion(sample)), true);
  assert.deepEqual(await store!.read(id), next);
});
void check('PostgreSQL professional: clear all fields', async () => {
  const id = await saved();
  assert.equal(await store!.write(id, empty, professionalVersion(sample)), true);
  assert.deepEqual(await store!.read(id), empty);
});
void check('PostgreSQL professional: reconnect preserves data', async () => {
  const id = await saved();
  const reconnect = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw }) });
  try {
    assert.deepEqual(await createProfessionalStore(reconnect).read(id), sample);
  } finally {
    await reconnect.$disconnect();
  }
});
void check(
  'PostgreSQL professional: database rejects missing and malformed top-level keys',
  async () => {
    const id = await saved();
    for (const value of [
      {},
      [],
      { ...empty, headline: 3 },
      { ...empty, education: {} },
      { ...empty, extra: true },
    ])
      await assert.rejects(
        pool!.query('UPDATE professional_profiles SET details=$2::jsonb WHERE user_id=$1', [
          id,
          JSON.stringify(value),
        ]),
        { code: '23514' },
      );
    assert.deepEqual(await store!.read(id), sample);
  },
);
void check('PostgreSQL professional: maximum headline validated then persisted', async () => {
  const id = await user();
  const value = parseProfessionalDetails({ ...empty, headline: 'x'.repeat(180) });
  assert.equal(await store!.write(id, value, professionalVersion(null)), true);
  assert.deepEqual(await store!.read(id), value);
  assert.throws(() => parseProfessionalDetails({ ...value, headline: 'x'.repeat(181) }));
});
void check('PostgreSQL professional: maximum collection counts', async () => {
  const id = await user();
  const value = parseProfessionalDetails({
    ...sample,
    education: Array(5).fill(sample.education[0]),
    experience: Array(5).fill(sample.experience[0]),
  });
  assert.equal(await store!.write(id, value, professionalVersion(null)), true);
  for (const key of ['education', 'experience'])
    await assert.rejects(
      pool!.query('UPDATE professional_profiles SET details=$2::jsonb WHERE user_id=$1', [
        id,
        JSON.stringify({ ...value, [key]: Array(6).fill({}) }),
      ]),
      { code: '23514' },
    );
});
void check(
  'PostgreSQL professional: unsupported fields and dates never reach persistence',
  async () => {
    const id = await saved();
    for (const value of [
      { ...sample, userId: 'other' },
      { ...sample, education: [{ ...sample.education[0], startDate: '2026-01-01' }] },
      { ...sample, experience: [{ ...sample.experience[0], endDate: '2025-01-01' }] },
    ])
      assert.throws(() => parseProfessionalDetails(value));
    assert.deepEqual(await store!.read(id), sample);
  },
);
void check(
  'PostgreSQL professional: independent owner documents and missing profile denial',
  async () => {
    const a = await saved(),
      b = await user();
    assert.equal(await store!.read(b), null);
    assert.equal(await store!.write(b, empty, professionalVersion(sample)), 'conflict');
    assert.deepEqual(await store!.read(a), sample);
    await pool!.query('DELETE FROM profiles WHERE user_id=$1', [b]);
    assert.equal(await store!.write(b, empty, professionalVersion(null)), false);
  },
);
void check('PostgreSQL professional: simultaneous first writes have one winner', async () => {
  const id = await user();
  const results = await Promise.all([
    store!.write(id, sample, professionalVersion(null)),
    store!.write(id, empty, professionalVersion(null)),
  ]);
  assert.equal(results.filter((x) => x === true).length, 1);
  assert.equal(results.filter((x) => x === 'conflict').length, 1);
  assert.ok(await store!.read(id));
  assert.equal(
    (
      await pool!.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM professional_profiles WHERE user_id=$1',
        [id],
      )
    ).rows[0]!.n,
    1,
  );
});
void check('PostgreSQL professional: concurrent updates reject stale version', async () => {
  const id = await saved();
  const a = { ...sample, headline: 'A' },
    b = { ...sample, headline: 'B' };
  const results = await Promise.all([
    store!.write(id, a, professionalVersion(sample)),
    store!.write(id, b, professionalVersion(sample)),
  ]);
  assert.equal(results.filter((x) => x === true).length, 1);
  assert.equal(results.filter((x) => x === 'conflict').length, 1);
  assert.deepEqual(await store!.read(id), results[0] === true ? a : b);
});
void check('PostgreSQL professional: post-upsert failure rolls back transaction', async () => {
  const id = await saved();
  const failing = db!.$extends({
    query: {
      professionalProfile: {
        async upsert({ args, query }) {
          await query(args);
          throw new Error('Synthetic failure after write');
        },
      },
    },
  });
  await assert.rejects(
    createProfessionalStore(failing as unknown as PrismaClient).write(
      id,
      empty,
      professionalVersion(sample),
    ),
  );
  assert.deepEqual(await store!.read(id), sample);
});
void check(
  'PostgreSQL professional: deactivation holding user lock prevents a pending save',
  async () => {
    const id = await saved();
    const blocker = await pool!.connect();
    let started!: () => void;
    const reached = new Promise<void>((r) => {
      started = r;
    });
    const client = db!.$extends({
      query: {
        async $allOperations({ operation, args, query }) {
          if (operation === '$queryRaw') started();
          const result: unknown = await query(args);
          return result;
        },
      },
    });
    try {
      await blocker.query('BEGIN');
      await blocker.query("UPDATE users SET status='DEACTIVATED' WHERE id=$1", [id]);
      const pending = createProfessionalStore(client as unknown as PrismaClient).write(
        id,
        empty,
        professionalVersion(sample),
      );
      await reached;
      await blocker.query('COMMIT');
      assert.equal(await pending, false);
      assert.deepEqual(
        (
          await pool!.query<{ details: unknown }>(
            'SELECT details FROM professional_profiles WHERE user_id=$1',
            [id],
          )
        ).rows[0]!.details,
        sample,
      );
      assert.equal(await store!.read(id), null);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
  },
);
void check('PostgreSQL professional: hard user delete cascades', async () => {
  const id = await saved();
  await pool!.query('DELETE FROM users WHERE id=$1', [id]);
  assert.equal(
    (await pool!.query('SELECT 1 FROM professional_profiles WHERE user_id=$1', [id])).rowCount,
    0,
  );
});
void check('PostgreSQL professional: public DTO excludes persisted private additions', async () => {
  const id = await saved();
  const repository = {
    ...profileRepository,
    findByUserId: async () => ({
      userId: id,
      email: 'synthetic@example.test',
      emailVerifiedAt: new Date(),
      fullName: 'Synthetic',
      avatar: null,
      bio: null,
      department: null,
      academicYear: null,
      location: null,
      skills: [],
      skillProficiencies: {},
      interests: [],
      achievements: [],
      portfolio: [],
      profileCompletion: 0,
      professionalDetails: await store!.read(id),
    }),
  };
  const dto = await createProfileService(repository).getPublicProfile(id);
  assert.ok(!JSON.stringify(dto).includes(sample.headline));
});
void check('PostgreSQL professional: effective browser role denial', async (t) => {
  const roles = (
    await pool!.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') AND NOT rolsuper AND NOT rolbypassrls",
    )
  ).rows.map((r) => String(r.rolname));
  if (roles.length !== 2) {
    t.skip('BLOCKED: anon/authenticated roles absent; no cluster roles created.');
    return;
  }
  for (const role of roles) {
    const c = await pool!.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL ROLE "${role}"`);
      await assert.rejects(c.query('SELECT * FROM public.professional_profiles'), {
        code: '42501',
      });
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
    const rls = await pool!.connect();
    try {
      await rls.query('BEGIN');
      await rls.query(`GRANT SELECT ON public.professional_profiles TO "${role}"`);
      await rls.query(`SET LOCAL ROLE "${role}"`);
      assert.equal(
        (await rls.query('SELECT * FROM public.professional_profiles')).rowCount,
        0,
        'No RLS policy must expose rows even when table SELECT is granted.',
      );
    } finally {
      await rls.query('ROLLBACK');
      rls.release();
    }
  }
});
void check(
  'PostgreSQL professional: actual SQL failure rolls back and HTTP logs exclude private error text',
  async () => {
    const id = await saved(),
      secret = 'SYNTHETIC_PRIVATE_EDUCATION_SQL_ERROR';
    const failingStore = {
      read: (userId: string) => store!.read(userId),
      write: (userId: string, _input: typeof empty, version: string) =>
        store!.write(
          userId,
          {
            headline: secret,
            education: Array.from({ length: 6 }, () => ({
              institution: 'Synthetic College',
              qualification: '',
            })),
            experience: [],
          },
          version,
        ),
    };
    const logs: unknown[] = [];
    const original = console.error,
      originalLog = console.log,
      originalWarn = console.warn;
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    console.warn = (...args: unknown[]) => {
      logs.push(args);
    };
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      const app = express();
      app.use(express.json());
      app.use(
        '/professional',
        createProfessionalRouter(true, failingStore, (req, _res, next) => {
          Object.assign(req, { auth: { user: { id, status: 'ACTIVE' } } });
          next();
        }),
      );
      app.use(errorHandler);
      await withTestServer(app, async (base) => {
        const response = await fetch(base + '/professional', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            'if-match': `"${professionalVersion(sample)}"`,
          },
          body: JSON.stringify(empty),
        });
        assert.equal(response.status, 503);
        assert.ok(!(await response.text()).includes(secret));
      });
      assert.ok(!JSON.stringify(logs).includes(secret));
      assert.deepEqual(await store!.read(id), sample);
    } finally {
      console.error = original;
      console.log = originalLog;
      console.warn = originalWarn;
    }
  },
);
