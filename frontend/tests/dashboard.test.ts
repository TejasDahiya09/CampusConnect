import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DashboardContent, DashboardSkeleton } from '../src/features/dashboard/DashboardContent';
import {
  dashboardAttention,
  dashboardModules,
  dashboardQuickActions,
  hasDashboardActivity,
  parseDashboardAnalytics,
} from '../src/features/dashboard/dashboard-service';
import { dashboardFixture, emptyDashboardFixture } from './fixtures/dashboard-fixtures';

const render = (value = dashboardFixture) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(DashboardContent, { data: value })),
  );

void test('Dashboard renders all four owned module counts and genuine secondary statuses', () => {
  const html = render();
  for (const text of [
    '7 active listings, 3 sold',
    '2 open reports, 5 resolved',
    '4 projects owned, 1 completed',
    '2 active services, 6 requests completed',
  ])
    assert.ok(html.includes(text), text);
  for (const module of dashboardModules) assert.ok(html.includes(`href="${module.path}"`));
  assert.ok(html.includes('Requests received'));
  assert.ok(html.includes('Completed projects are included in that owned total'));
  assert.ok(html.includes('open, matched and claim-pending'));
});
void test('Dashboard zero state preserves real zero metrics, practical routes and honest attention empty state', () => {
  const html = render(emptyDashboardFixture);
  assert.equal(hasDashboardActivity(emptyDashboardFixture), false);
  assert.ok(html.includes('Your activity starts here'));
  assert.ok(html.includes('Nothing waiting here'));
  assert.equal((html.match(/class="cc-db-value">0/g) ?? []).length, 4);
  assert.equal(dashboardAttention(emptyDashboardFixture).length, 0);
  assert.ok(html.includes('Quick actions'));
});
void test('Dashboard attention separates received provider requests from private unread messages', () => {
  assert.deepEqual(
    dashboardAttention(dashboardFixture).map((item) => [item.count, item.path]),
    [
      [3, '/services/saved'],
      [8, '/messages'],
    ],
  );
  const pendingOnly = {
    ...emptyDashboardFixture,
    insights: {
      ...emptyDashboardFixture.insights,
      services: { pendingRequests: 2, completedRequests: 0 },
    },
  };
  assert.equal(hasDashboardActivity(pendingOnly), true);
  assert.equal(dashboardAttention(pendingOnly).length, 1);
  assert.ok(!render().includes('Pending TeamUp applications'));
  assert.ok(!render().includes('Recent activity'));
});
void test('Dashboard quick actions point to existing create, report-type and message contracts', () => {
  assert.deepEqual(
    dashboardQuickActions.map((item) => item.path),
    [
      '/marketplace/new',
      '/lost-found/new?type=lost',
      '/lost-found/new?type=found',
      '/teamup/new',
      '/services/new',
      '/messages',
    ],
  );
  const html = render();
  for (const item of dashboardQuickActions) assert.ok(html.includes(`href="${item.path}"`));
});
void test('Dashboard rejects incomplete, duplicate, negative and non-finite aggregate responses instead of showing zeros', () => {
  assert.deepEqual(parseDashboardAnalytics(dashboardFixture), dashboardFixture);
  for (const value of [
    null,
    {},
    { ...dashboardFixture, metrics: dashboardFixture.metrics.slice(0, 3) },
    {
      ...dashboardFixture,
      metrics: [...dashboardFixture.metrics.slice(0, 3), dashboardFixture.metrics[0]],
    },
    { ...dashboardFixture, insights: { ...dashboardFixture.insights, communication: {} } },
  ])
    assert.throws(() => parseDashboardAnalytics(value));
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      parseDashboardAnalytics({
        ...dashboardFixture,
        metrics: dashboardFixture.metrics.map((row) =>
          row.id === 'services' ? { ...row, value } : row,
        ),
      }),
    );
});
void test('Dashboard projection strips unexpected private fields and React escapes visible strings', () => {
  const parsed = parseDashboardAnalytics({
    ...dashboardFixture,
    email: 'private@example.test',
    privateMessage: 'private-body',
    metrics: dashboardFixture.metrics.map((row) => ({ ...row, secret: 'private' })),
  });
  assert.ok(!JSON.stringify(parsed).includes('private'));
  const html = render({
    ...dashboardFixture,
    metrics: dashboardFixture.metrics.map((row) => ({
      ...row,
      label: '<img src=x onerror=alert(1)>',
    })),
  });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});
void test('Dashboard loading skeleton announces its state without pretending zero totals loaded', () => {
  const html = renderToStaticMarkup(createElement(DashboardSkeleton));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-busy="true"'));
  assert.ok(html.includes('Totals will appear'));
  assert.ok(!html.includes('cc-db-value'));
});

void test('Dashboard keeps one metric navigation grid and relocates all count explanations beside it', () => {
  const html = render();
  assert.ok(!html.includes('Manage your activity'));
  assert.ok(!html.includes('cc-db-workspaces'));
  assert.ok(!html.includes('Your activity workspaces'));
  assert.ok(!html.includes('href="/profile"'));
  assert.equal((html.match(/class="cc-metric-card cc-db-metric"/g) ?? []).length, 4);
  assert.ok(html.indexOf('What do these counts include?') < html.indexOf('cc-db-work-grid'));
  assert.ok(html.includes('Notifications have a separate count'));
  assert.ok(html.includes('unread and not deleted'));
});

void test('Dashboard empty attention has one scoped explanation without a redundant message action or footer', () => {
  const quiet = {
    ...dashboardFixture,
    insights: {
      ...dashboardFixture.insights,
      services: { ...dashboardFixture.insights.services, pendingRequests: 0 },
      communication: { unreadMessages: 0 },
    },
  };
  const html = render(quiet);
  assert.ok(html.includes('Nothing waiting here'));
  assert.ok(
    html.includes('No pending service requests received or unread messages in this snapshot.'),
  );
  assert.ok(!html.includes('cc-db-caption'));
  // Messages remains once in the useful quick actions, rather than inside the empty state too.
  assert.equal((html.match(/href="\/messages"/g) ?? []).length, 1);
  assert.equal((html.match(/class="cc-db-action"/g) ?? []).length, 6);
});
