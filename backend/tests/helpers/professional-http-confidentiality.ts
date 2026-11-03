/** Synthetic fault AFTER a genuine repository upsert, BEFORE real transaction commit. */
import assert from 'node:assert/strict';
import { inspect, isDeepStrictEqual } from 'node:util';
import type { PrismaClient, Prisma } from '../../src/generated/prisma/client.js';
import {
  createProfessionalStore,
  professionalVersion,
  type ProfessionalDetails,
} from '../../src/modules/profile/professional-profile.js';
import { createProfessionalHttpFixture } from './professional-http-app.js';
import { withTestServer } from './test-server.js';
export const confidentialityName =
  'database-backed storage failure rolls back and keeps responses/logs confidential';
export function rollbackFailureClient(client: PrismaClient, message: string) {
  let active = true,
    completed = false;
  const injected = new Proxy(client, {
    get(target, key) {
      if (key === '$transaction')
        return (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          target.$transaction(async (tx) => {
            if (!active) return work(tx);
            const delegate = new Proxy(tx.professionalProfile, {
              get(model, property) {
                if (property === 'upsert')
                  return async (args: Prisma.ProfessionalProfileUpsertArgs) => {
                    const result = await model.upsert(args);
                    completed = true;
                    return result;
                  };
                return Reflect.get(model, property, model) as unknown;
              },
            });
            const observed = new Proxy(tx, {
              get(transaction, property) {
                return property === 'professionalProfile'
                  ? delegate
                  : (Reflect.get(transaction, property, transaction) as unknown);
              },
            });
            await work(observed);
            throw new Error(message);
          });
      return Reflect.get(target, key, target) as unknown;
    },
  });
  return {
    client: injected,
    completed: () => completed,
    disable: () => {
      active = false;
    },
    active: () => active,
  };
}
export function assertConfidential(text: string, privateValues: readonly string[]) {
  assert.ok(
    privateValues.every((value) => !value || !text.includes(value)),
    'Private synthetic value escaped confidentiality boundary.',
  );
}
export async function runStorageFailureConfidentiality(
  db: PrismaClient,
  options: Pick<Parameters<typeof createProfessionalHttpFixture>[0], 'users' | 'profiles'>,
  owner: string,
) {
  const before =
    (
      await db.professionalProfile.findUnique({
        where: { userId: owner },
        select: { details: true },
      })
    )?.details ?? null;
  assert.ok(
    before !== null,
    'Confidentiality case requires an already persisted synthetic document.',
  );
  const attempt: ProfessionalDetails = {
    headline: 'SYNTHETIC_PRIVATE_FAILURE_HEADLINE',
    education: [
      {
        institution: 'SYNTHETIC_PRIVATE_FAILURE_EDUCATION',
        qualification: 'Synthetic qualification',
      },
    ],
    experience: [
      {
        role: 'SYNTHETIC_PRIVATE_FAILURE_EXPERIENCE',
        organization: 'Synthetic organization',
        description: 'Synthetic private failure description',
      },
    ],
  };
  const credential = 'SYNTHETIC_CREDENTIAL_CANARY_NOT_A_REAL_SECRET';
  const strings = (value: unknown): string[] =>
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(strings)
        : value && typeof value === 'object'
          ? Object.values(value).flatMap(strings)
          : [];
  const privateValues = [...strings(before), ...strings(attempt), credential];
  const fault = rollbackFailureClient(db, JSON.stringify({ before, attempt, credential }));
  const logs: string[] = [];
  const originalError = console.error,
    originalWarn = console.warn;
  try {
    console.error = (...args: unknown[]) => {
      logs.push(inspect(args, { depth: 8 }));
    };
    console.warn = (...args: unknown[]) => {
      logs.push(inspect(args, { depth: 8 }));
    };
    const fixture = createProfessionalHttpFixture({
      ...options,
      store: createProfessionalStore(fault.client),
    });
    await withTestServer(fixture.app, async (base) => {
      const response = await fetch(base + '/api/profile/me/professional', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await fixture.token(owner)}`,
          'content-type': 'application/json',
          'if-match': `"${professionalVersion(before)}"`,
        },
        body: JSON.stringify(attempt),
      });
      assert.equal(response.status, 503);
      const body = await response.text();
      assertConfidential(body, privateValues);
      assert.ok(
        body.includes('PROFESSIONAL_STORAGE_ERROR'),
        'Expected real route storage-error contract.',
      );
    });
    assert.ok(
      fault.completed(),
      'Failure must follow a completed database upsert, not a mocked route or pre-write failure.',
    );
    assert.ok(
      logs.length > 0 && logs.join('\n').includes('PROFESSIONAL_STORAGE_ERROR'),
      'Real application error middleware must log the sanitized failure.',
    );
    assertConfidential(logs.join('\n'), privateValues);
  } finally {
    fault.disable();
    console.error = originalError;
    console.warn = originalWarn;
  }
  assert.equal(fault.active(), false, 'Temporary fault must be disabled before further work.');
  const after =
    (
      await db.professionalProfile.findUnique({
        where: { userId: owner },
        select: { details: true },
      })
    )?.details ?? null;
  assert.ok(isDeepStrictEqual(after, before), 'Failed persistence changed the prior document.');
  // Fresh genuine route GET with the original client, after removing the injected fault.
  const fixture = createProfessionalHttpFixture({ ...options, store: createProfessionalStore(db) });
  await withTestServer(fixture.app, async (base) => {
    const response = await fetch(base + '/api/profile/me/professional', {
      headers: { authorization: `Bearer ${await fixture.token(owner)}` },
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as { data: { professional: { details: unknown } } };
    assert.ok(
      isDeepStrictEqual(result.data.professional.details, before),
      'Fresh GET must preserve the pre-failure document.',
    );
  });
}
