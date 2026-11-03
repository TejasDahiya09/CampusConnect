import assert from 'node:assert/strict';
import test from 'node:test';
import type { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';
import { createDashboardService } from '../src/modules/dashboard/dashboard.service.js';
const repository: DashboardRepository = {
  read: () =>
    Promise.resolve({
      activeListings: 2,
      soldListings: 1,
      activeReports: 3,
      resolvedReports: 2,
      ownedProjects: 2,
      completedProjects: 1,
      activeServices: 1,
      serviceBookings: [[{ status: 'PENDING', message: 'private' }, { status: 'COMPLETED' }]],
      unreadMessages: 4,
    }),
};
void test('student dashboard returns truthful owned metrics and status breakdowns', async () => {
  const result = await createDashboardService(repository).get('user');
  assert.deepEqual(
    result.metrics.map(({ value }) => value),
    [2, 3, 2, 1],
  );
  assert.equal(result.insights.marketplace.sold, 1);
  assert.equal(result.insights.services.pendingRequests, 1);
  assert.equal(result.insights.services.completedRequests, 1);
  assert.equal(result.insights.communication.unreadMessages, 4);
});
void test('student dashboard excludes request and message content', async () => {
  const serialized = JSON.stringify(await createDashboardService(repository).get('user'));
  assert.equal(serialized.includes('private'), false);
  assert.equal(serialized.includes('encryptedContent'), false);
  assert.equal(serialized.includes('email'), false);
});
