/** Mocked adapter regression of the fault harness; NOT real PostgreSQL evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountStatus, UserRole, type PrismaClient } from '../src/generated/prisma/client.js';
import {
  runStorageFailureConfidentiality,
  assertConfidential,
} from './helpers/professional-http-confidentiality.js';
void test('confidentiality harness executes real middleware/router/repository, asserts rollback and restores logging (mocked adapter only)', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const original = {
    headline: 'Synthetic previously saved headline',
    education: [{ institution: 'Synthetic previously saved college', qualification: '' }],
    experience: [
      {
        role: 'Synthetic previous role',
        organization: 'Synthetic previous team',
        description: 'Synthetic previous notes',
      },
    ],
  };
  let document: unknown = structuredClone(original),
    upserts = 0,
    rollbacks = 0,
    transactions = 0;
  const model = {
    findUnique: () => Promise.resolve({ details: structuredClone(document) }),
    findFirst: () => Promise.resolve({ details: structuredClone(document) }),
    upsert: (args: { create: { details: unknown }; update: { details: unknown } }) => {
      upserts++;
      document = structuredClone(args.update.details);
      return Promise.resolve({ details: document });
    },
  };
  const tx = {
    professionalProfile: model,
    $queryRaw: () => Promise.resolve([{ id: owner }]),
    user: { findUnique: () => Promise.resolve({ status: 'ACTIVE', profile: { userId: owner } }) },
  };
  const client = {
    professionalProfile: model,
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
      transactions++;
      const saved = structuredClone(document);
      try {
        return await work(tx);
      } catch (error) {
        rollbacks++;
        document = saved;
        throw error;
      }
    },
  } as unknown as PrismaClient;
  const beforeError = console.error,
    beforeWarn = console.warn;
  await runStorageFailureConfidentiality(
    client,
    {
      users: {
        findById: (id) =>
          Promise.resolve({
            id,
            email: 'synthetic@example.test',
            emailVerifiedAt: new Date(),
            role: UserRole.STUDENT,
            status: AccountStatus.ACTIVE,
            profile: { id, displayName: 'Synthetic student' },
          }),
      },
      profiles: { findByUserId: () => Promise.resolve(null) },
    },
    owner,
  );
  assert.equal(transactions, 1);
  assert.equal(upserts, 1);
  assert.equal(rollbacks, 1);
  assert.deepEqual(document, original);
  assert.equal(console.error, beforeError);
  assert.equal(console.warn, beforeWarn);
});
void test('confidentiality assertions fail for any leaked headline, education, experience or credential', () => {
  for (const value of [
    'synthetic-headline',
    'synthetic-education',
    'synthetic-experience',
    'synthetic-credential',
  ])
    assert.throws(() => assertConfidential('leaked ' + value, [value]), /confidentiality boundary/);
  assertConfidential('Generic storage failure.', ['synthetic-private']);
});
void test('confidentiality assertions do not output raw sensitive values on failure', () => {
  const value = 'SYNTHETIC_PRIVATE_SENTINEL';
  let message = '';
  try {
    assertConfidential(value, [value]);
  } catch (error) {
    message = String(error);
  }
  assert.ok(message.length > 0);
  assert.ok(!message.includes(value));
});
