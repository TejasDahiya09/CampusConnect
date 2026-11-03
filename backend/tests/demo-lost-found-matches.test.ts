import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLostFoundMatchTargets } from '../src/database/demo-lost-found-matches/demo-lost-found-matches.data.js';
import {
  preflightLostFoundMatchUpdate,
  type LostFoundMatchUpdateStore,
} from '../src/database/demo-lost-found-matches/demo-lost-found-matches.service.js';
import { buildDemoSeedPlan } from '../src/database/demo-seed/demo-seed.data.js';

const ids = [
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000003',
] as const;

const currentRecords = buildDemoSeedPlan(ids).lostFound.map((record) => ({
  ...record,
  images: [{ key: `lost-found/${record.id}/demo.jpg` }],
}));

type StoreRecords = Awaited<ReturnType<LostFoundMatchUpdateStore['findTargets']>>;

const storeFor = (records: StoreRecords, markedCount = 9): LostFoundMatchUpdateStore => ({
  apply: () => Promise.resolve({ updated: 0 }),
  countMarked: () => Promise.resolve(markedCount),
  findTargets: () => Promise.resolve(records),
});

void describe('Lost & Found examiner matching dataset', () => {
  void it('defines exactly four cross-user pairs and one unrelated control', () => {
    const targets = buildLostFoundMatchTargets(ids);
    assert.equal(targets.length, 9);
    assert.equal(targets.filter(({ type }) => type === 'LOST').length, 4);
    assert.equal(targets.filter(({ type }) => type === 'FOUND').length, 5);

    const pairs = [
      ['Casio FX-991ES Plus Scientific Calculator', 'Casio FX-991ES Plus Scientific Calculator'],
      ['Black Wireless Earbuds in Charging Case', 'Bluetooth Earphones with Black Charging Case'],
      ['Blue Data Structures Notebook', 'Blue DSA Class Notes Register'],
      ['Grey College Backpack', 'Dark Grey Student Laptop Bag'],
    ] as const;
    for (const [lostTitle, foundTitle] of pairs) {
      const lost = targets.find(({ title, type }) => title === lostTitle && type === 'LOST');
      const found = targets.find(({ title, type }) => title === foundTitle && type === 'FOUND');
      assert.ok(lost);
      assert.ok(found);
      assert.notEqual(lost.reporterId, found.reporterId);
    }
    assert.ok(
      targets.some(({ title, type }) => title === 'Blue Steel Water Bottle' && type === 'FOUND'),
    );
  });

  void it('preflights the current records without writes and preserves media metadata', async () => {
    let writes = 0;
    const base = storeFor(currentRecords);
    const store: LostFoundMatchUpdateStore = {
      ...base,
      apply: () => {
        writes += 1;
        return Promise.resolve({ updated: 9 });
      },
    };
    const result = await preflightLostFoundMatchUpdate(store, ids);
    assert.equal(result.state, 'CURRENT');
    assert.equal(writes, 0);
    assert.equal(
      currentRecords.every(({ images }) => images.length === 1),
      true,
    );
    assert.equal(
      result.imageCompatibility.filter(
        ({ imageCompatibility }) => imageCompatibility === 'COMPATIBLE',
      ).length,
      5,
    );
  });

  void it('accepts the completed target state idempotently', async () => {
    const targets = buildLostFoundMatchTargets(ids).map((target) => ({
      ...target,
      images: [{ key: `lost-found/${target.id}/demo.jpg` }],
      status: 'OPEN',
    }));
    const result = await preflightLostFoundMatchUpdate(storeFor(targets), ids);
    assert.equal(result.state, 'TARGET');
  });

  void it('refuses missing, extra, or drifted demo records', async () => {
    await assert.rejects(
      preflightLostFoundMatchUpdate(storeFor(currentRecords.slice(0, 8)), ids),
      /exactly nine/,
    );
    await assert.rejects(
      preflightLostFoundMatchUpdate(storeFor(currentRecords, 10), ids),
      /exactly nine/,
    );
    const drifted = currentRecords.map((record, index) =>
      index === 0 ? { ...record, title: 'Unexpected real record' } : record,
    );
    await assert.rejects(preflightLostFoundMatchUpdate(storeFor(drifted), ids), /no longer match/);
  });
});
