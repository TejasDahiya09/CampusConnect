import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { prisma } from '../src/database/prisma.js';
import { AccountStatus, ModerationVisibility, Prisma } from '../src/generated/prisma/client.js';
import { servicePerson, runServicesTransaction } from '../src/modules/services/services-policy.js';
import { parseServiceQuery } from '../src/modules/services/services.validation.js';

void test('Services pricing bounds compose and validate without changing parameter names', () => {
  const q = parseServiceQuery({ pricingType: 'FIXED', minPrice: '10.00', maxPrice: '250.00' });
  assert.equal(q.minPrice, '10.00');
  assert.equal(q.maxPrice, '250.00');
  assert.equal(q.limit, 12);
  assert.equal(
    parseServiceQuery({ pricingType: 'FREE', minPrice: '0', maxPrice: '10' }).pricingType,
    'FREE',
  );
  assert.equal(parseServiceQuery({ pricingType: 'NEGOTIABLE' }).pricingType, 'NEGOTIABLE');
  for (const input of [
    { minPrice: '20', maxPrice: '10' },
    { pricingType: 'NEGOTIABLE', minPrice: '0' },
    { pricingType: 'FREE', minPrice: '1' },
    { pricingType: 'FIXED', maxPrice: '0' },
    { minPrice: '-1' },
    { maxPrice: '10000001' },
    { minPrice: '9'.repeat(1000) },
  ])
    assert.throws(() => parseServiceQuery(input), { code: 'VALIDATION_ERROR' });
});
for (const status of [AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.DEACTIVATED]) {
  for (const moderationVisibility of [ModerationVisibility.VISIBLE, ModerationVisibility.HIDDEN]) {
    void test(`Services identity ${status}/${moderationVisibility} obeys profile privacy`, () => {
      const person = servicePerson({
        id: 'identity',
        status,
        profile: {
          fullName: 'Private synthetic identity',
          department: 'Private department',
          avatar: { secret: 'avatar' },
          moderationVisibility,
        },
      });
      if (status === 'ACTIVE' && moderationVisibility === 'VISIBLE')
        assert.equal(person.displayName, 'Private synthetic identity');
      else
        assert.deepEqual(person, {
          id: 'identity',
          displayName: 'CampusConnect student',
          department: null,
          avatar: null,
        });
      assert.equal('email' in person, false);
      assert.equal('status' in person, false);
    });
  }
}
void test('Services retries only real serialization/deadlock codes and bounds exhaustion', async () => {
  for (const meta of [
    { code: '40001' },
    { driverAdapterError: { cause: { originalCode: '40P01' } } },
  ]) {
    let attempts = 0;
    const db = {
      $transaction: () => {
        attempts++;
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Synthetic conflict', {
            code: 'P2010',
            clientVersion: '7.10.0',
            meta,
          }),
        );
      },
    } as unknown as typeof prisma;
    await assert.rejects(
      runServicesTransaction(db, () => Promise.resolve(null)),
      { code: 'SERVICE_CONCURRENCY_CONFLICT', statusCode: 409 },
    );
    assert.equal(attempts, 3);
  }
  let attempts = 0;
  const db = {
    $transaction: () => {
      attempts++;
      return Promise.reject(
        new Prisma.PrismaClientKnownRequestError('Unrelated database error', {
          code: 'P2010',
          clientVersion: '7.10.0',
          meta: { code: '23514' },
        }),
      );
    },
  } as unknown as typeof prisma;
  await assert.rejects(
    runServicesTransaction(db, () => Promise.resolve(null)),
    { code: 'P2010' },
  );
  assert.equal(attempts, 1);
});
