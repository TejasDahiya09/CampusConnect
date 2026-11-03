import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LostFoundStatus, LostFoundType } from '../src/generated/prisma/client.js';
import { buildLostFoundWhere } from '../src/modules/lost-found/lost-found.repository.js';
import {
  parseLostFoundClaims,
  parseLostFoundImages,
  parseStringArray,
} from '../src/modules/lost-found/lost-found-json.js';
import {
  parseLostFoundCreate,
  parseLostFoundQuery,
  parseLostFoundUpdate,
} from '../src/modules/lost-found/lost-found.validation.js';

void describe('Lost & Found validation and discovery', () => {
  void it('validates report creation and rejects client ownership', () => {
    const input = parseLostFoundCreate({
      category: 'Electronics',
      description: 'A sufficiently detailed report.',
      incidentDate: '2026-10-01',
      location: 'Library',
      title: 'Lost calculator',
      type: LostFoundType.LOST,
    });
    assert.equal(input.type, LostFoundType.LOST);
    assert.throws(() => parseLostFoundCreate({ ...input, reporterId: 'client-controlled' }), {
      name: 'ValidationError',
    });
  });

  void it('rejects malformed bodies, dates, enums, and status updates', () => {
    assert.throws(() => parseLostFoundCreate([]), { name: 'ValidationError' });
    assert.throws(() => parseLostFoundCreate({}), { name: 'ValidationError' });
    assert.throws(() => parseLostFoundUpdate({ status: LostFoundStatus.RESOLVED }), {
      name: 'ValidationError',
    });
    assert.throws(() => parseLostFoundQuery({ dateFrom: '2026-12-01', dateTo: '2026-01-01' }), {
      name: 'ValidationError',
    });
  });

  void it('builds search, filter, pagination, and sorting inputs', () => {
    const query = parseLostFoundQuery({
      category: 'Electronics',
      keyword: 'calculator',
      limit: '10',
      location: 'Library',
      page: '2',
      sort: 'incident_newest',
      status: LostFoundStatus.OPEN,
      type: LostFoundType.LOST,
    });
    assert.equal(query.limit, 10);
    assert.equal(query.page, 2);
    const where = buildLostFoundWhere(query);
    assert.equal(where.status, LostFoundStatus.OPEN);
    assert.equal(where.type, LostFoundType.LOST);
  });

  void it('safely ignores malformed legacy JSON values', () => {
    assert.deepEqual(parseStringArray({ invalid: true }), []);
    assert.deepEqual(parseLostFoundImages([{ id: 'missing-required-fields' }]), []);
    assert.deepEqual(
      parseLostFoundClaims([
        {
          claimantId: 'claimant',
          createdAt: '2026-10-01T00:00:00.000Z',
          id: 'claim',
          message: 'Claim details',
          status: 'NOT_A_STATUS',
        },
      ]),
      [],
    );
  });
});
