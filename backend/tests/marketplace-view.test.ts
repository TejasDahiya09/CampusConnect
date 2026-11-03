import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createMarketplaceViewService,
  isPersonalizedViewEligible,
  MARKETPLACE_VIEW_DEDUP_MINUTES,
  type MarketplaceViewRepository,
} from '../src/modules/marketplace/marketplace-view.service.js';

const userOne = '11111111-1111-4111-8111-111111111111';
const userTwo = '22222222-2222-4222-8222-222222222222';
const listingOne = '33333333-3333-4333-8333-333333333333';
const listingTwo = '44444444-4444-4444-8444-444444444444';

interface ViewRecord {
  readonly createdAt: Date;
  readonly listingId: string;
  readonly userId: string;
}

const inMemoryRepository = (records: ViewRecord[]): MarketplaceViewRepository => ({
  recordIfEligible: (userId, listingId, cutoff) => {
    const duplicate = records.some(
      (record) =>
        record.userId === userId && record.listingId === listingId && record.createdAt >= cutoff,
    );
    if (duplicate) return Promise.resolve(false);
    records.push({
      createdAt: new Date(cutoff.getTime() + MARKETPLACE_VIEW_DEDUP_MINUTES * 60_000),
      listingId,
      userId,
    });
    return Promise.resolve(true);
  },
});

void describe('Marketplace authenticated view activity', () => {
  void it('persists the first view and deduplicates the same user/listing inside 30 minutes', async () => {
    const records: ViewRecord[] = [];
    const service = createMarketplaceViewService(inMemoryRepository(records));
    const first = new Date('2026-10-07T10:00:00.000Z');

    assert.equal(await service.record(userOne, listingOne, first), true);
    assert.equal(
      await service.record(userOne, listingOne, new Date(first.getTime() + 29 * 60_000)),
      false,
    );
    assert.equal(records.length, 1);
  });

  void it('allows a later view after the window expires', async () => {
    const records: ViewRecord[] = [];
    const service = createMarketplaceViewService(inMemoryRepository(records));
    const first = new Date('2026-10-07T10:00:00.000Z');

    await service.record(userOne, listingOne, first);
    assert.equal(
      await service.record(userOne, listingOne, new Date(first.getTime() + 31 * 60_000)),
      true,
    );
    assert.equal(records.length, 2);
  });

  void it('keeps different listings and different users independent', async () => {
    const records: ViewRecord[] = [];
    const service = createMarketplaceViewService(inMemoryRepository(records));
    const now = new Date('2026-10-07T10:00:00.000Z');

    assert.equal(await service.record(userOne, listingOne, now), true);
    assert.equal(await service.record(userOne, listingTwo, now), true);
    assert.equal(await service.record(userTwo, listingOne, now), true);
    assert.equal(records.length, 3);
  });

  void it('derives identity from its caller and exposes no arbitrary event input', async () => {
    let received: readonly [string, string] | undefined;
    const repository: MarketplaceViewRepository = {
      recordIfEligible: (userId, listingId) => {
        received = [userId, listingId];
        return Promise.resolve(true);
      },
    };
    await createMarketplaceViewService(repository).record(userOne, listingOne);
    assert.deepEqual(received, [userOne, listingOne]);
  });

  void it('excludes own and nonexistent listings from personalized view eligibility', () => {
    assert.equal(isPersonalizedViewEligible(userOne, userOne), false);
    assert.equal(isPersonalizedViewEligible(undefined, userOne), false);
    assert.equal(isPersonalizedViewEligible(userTwo, userOne), true);
  });
});
