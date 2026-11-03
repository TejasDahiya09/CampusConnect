import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AccountStatus,
  ListingStatus,
  ModerationVisibility,
} from '../src/generated/prisma/client.js';
import {
  eligibleViewedListingWhere,
  recommendationCandidateWhere,
} from '../src/modules/marketplace/marketplace-recommendation.service.js';

void describe('Marketplace recommendation eligibility', () => {
  void it('requires an active listing, active seller, and excludes the requesting user', () => {
    assert.deepEqual(recommendationCandidateWhere('viewer'), {
      moderationVisibility: ModerationVisibility.VISIBLE,
      seller: { status: AccountStatus.ACTIVE },
      sellerId: { not: 'viewer' },
      status: ListingStatus.ACTIVE,
    });
  });

  void it('allows only currently eligible viewed listings to influence recommendations', () => {
    assert.deepEqual(eligibleViewedListingWhere('viewer', ['active-view']), {
      id: { in: ['active-view'] },
      moderationVisibility: ModerationVisibility.VISIBLE,
      seller: { status: AccountStatus.ACTIVE },
      sellerId: { not: 'viewer' },
      status: ListingStatus.ACTIVE,
    });
  });
});
