import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import {
  parseDemoSeedConfiguration,
  parseDemoUserIds,
  requireWriteConfirmation,
} from '../src/database/demo-seed/demo-seed.config.js';
import { buildDemoSeedPlan } from '../src/database/demo-seed/demo-seed.data.js';
import {
  assertNoDemoIdCollisions,
  countsForPlan,
  prepareDemoSeed,
  validateDemoUsers,
  type DemoSeedStore,
} from '../src/database/demo-seed/demo-seed.service.js';
import { DEMO_MARKER, type DemoSeedCounts } from '../src/database/demo-seed/demo-seed.types.js';

const ids = [
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000003',
] as const;
const users = ids.map((id, index) => ({
  id,
  profile: { fullName: `Demo Student ${index + 1}` },
  role: UserRole.STUDENT,
  status: AccountStatus.ACTIVE,
}));

void describe('examiner demo seed safety', () => {
  void it('requires exactly three distinct explicit UUIDs', () => {
    assert.throws(() => parseDemoUserIds(undefined), /DEMO_USER_IDS is required/);
    assert.throws(() => parseDemoUserIds(`${ids[0]},${ids[0]},${ids[2]}`), /distinct/);
    assert.throws(() => parseDemoUserIds(`${ids[0]},${ids[1]}`), /exactly three/);
    assert.deepEqual(parseDemoUserIds(ids.join(',')), ids);
  });

  void it('rejects unknown, suspended, privileged, and profile-less accounts', () => {
    assert.throws(() => validateDemoUsers(ids, users.slice(0, 2)), /does not exist/);
    assert.throws(
      () =>
        validateDemoUsers(
          ids,
          users.map((user, index) =>
            index === 1 ? { ...user, status: AccountStatus.SUSPENDED } : user,
          ),
        ),
      /is not active/,
    );
    assert.throws(
      () =>
        validateDemoUsers(
          ids,
          users.map((user, index) => (index === 1 ? { ...user, role: UserRole.ADMIN } : user)),
        ),
      /is not a student/,
    );
    assert.throws(
      () =>
        validateDemoUsers(
          ids,
          users.map((user, index) => (index === 1 ? { ...user, profile: null } : user)),
        ),
      /does not have a profile/,
    );
  });

  void it('requires an explicit demo environment and exact approved database host', () => {
    const environment = {
      DATABASE_URL: 'postgresql://user:secret@db.example.test:5432/campusconnect',
      DEMO_SEED_APPROVED_DATABASE_HOST: 'db.example.test',
      DEMO_SEED_ENVIRONMENT: 'demo',
      DEMO_USER_IDS: ids.join(','),
      NODE_ENV: 'development',
    };
    assert.equal(parseDemoSeedConfiguration(environment).databaseHost, 'db.example.test');
    assert.throws(
      () => parseDemoSeedConfiguration({ ...environment, NODE_ENV: 'production' }),
      /disabled.*production/,
    );
    assert.throws(
      () =>
        parseDemoSeedConfiguration({
          ...environment,
          DEMO_SEED_APPROVED_DATABASE_HOST: 'other.example.test',
        }),
      /does not match/,
    );
    assert.throws(
      () => parseDemoSeedConfiguration({ ...environment, DEMO_SEED_ENVIRONMENT: 'development' }),
      /exactly "demo"/,
    );
  });

  void it('requires an explicit confirmation flag before writes', () => {
    assert.throws(() => requireWriteConfirmation([]), /--confirm-demo-seed/);
    assert.doesNotThrow(() => requireWriteConfirmation(['--confirm-demo-seed']));
  });

  void it('builds deterministic records with correct ownership and valid relationships', () => {
    const first = buildDemoSeedPlan(ids);
    const second = buildDemoSeedPlan(ids);
    assert.deepEqual(first, second);
    assert.deepEqual(countsForPlan(first), {
      lostFound: 9,
      marketplace: 12,
      services: 9,
      teamUp: 9,
    });
    for (const userId of ids) {
      assert.equal(first.marketplace.filter(({ sellerId }) => sellerId === userId).length, 4);
      assert.equal(first.lostFound.filter(({ reporterId }) => reporterId === userId).length, 3);
      assert.equal(first.teamUp.filter(({ ownerId }) => ownerId === userId).length, 3);
      assert.equal(first.services.filter(({ providerId }) => providerId === userId).length, 3);
    }
    const knownIds = new Set<string>(ids);
    for (const record of [
      ...first.marketplace,
      ...first.lostFound,
      ...first.teamUp,
      ...first.services,
    ]) {
      assert.match(record.description, /campusconnect-examiner-demo-v1/);
    }
    assert.ok(first.marketplace.every(({ sellerId }) => knownIds.has(sellerId)));
    assert.ok(first.lostFound.every(({ reporterId }) => knownIds.has(reporterId)));
    assert.ok(first.teamUp.every(({ ownerId }) => knownIds.has(ownerId)));
    assert.ok(first.services.every(({ providerId }) => knownIds.has(providerId)));
    assert.ok(first.marketplace.every(({ images }) => images.length === 0));
    assert.ok(first.lostFound.every(({ images }) => images.length === 0));
  });

  void it('rejects deterministic ID collisions with non-demo records', () => {
    assert.doesNotThrow(() => assertNoDemoIdCollisions([{ description: DEMO_MARKER, id: 'demo' }]));
    assert.throws(
      () => assertNoDemoIdCollisions([{ description: 'A real student record', id: 'real' }]),
      /collision.*no data was written/i,
    );
  });

  void it('performs read-only preflight without mutating users or records', async () => {
    const originalUsers = structuredClone(users);
    let inserts = 0;
    let cleanups = 0;
    const zero: DemoSeedCounts = { lostFound: 0, marketplace: 0, services: 0, teamUp: 0 };
    const store: DemoSeedStore = {
      cleanup: () => {
        cleanups += 1;
        return Promise.resolve(zero);
      },
      findExistingRecords: () => Promise.resolve([]),
      findUsers: () => Promise.resolve(users),
      insert: () => {
        inserts += 1;
        return Promise.resolve(zero);
      },
    };
    await prepareDemoSeed(store, buildDemoSeedPlan(ids));
    assert.equal(inserts, 0);
    assert.equal(cleanups, 0);
    assert.deepEqual(users, originalUsers);
  });
});
