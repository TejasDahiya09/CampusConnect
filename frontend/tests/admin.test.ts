import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

void test('admin route and navigation require backend allowlist confirmation', async () => {
  const [app, shell, service] = await Promise.all([
    source('app/App.tsx'),
    source('app/AppShell.tsx'),
    source('features/admin/admin-service.ts'),
  ]);
  assert.match(app, /function AdminRoute/u);
  assert.match(app, /adminApi\s*\.access/u);
  assert.match(app, /applicationUser\?\.role !== 'ADMIN'/u);
  assert.match(shell, /applicationUser\?\.role === 'ADMIN' && adminAuthorized/u);
  assert.match(service, /\/api\/admin\/access/u);
});
void test('admin dashboard uses real APIs and exposes required operational sections', async () => {
  const page = await source('features/admin/AdminPage.tsx');
  for (const label of [
    'Overview',
    'Users',
    'Content',
    'Audit logs',
    'System',
    'Open moderation queue',
  ])
    assert.ok(page.includes(label));
  for (const method of ['overview', 'users', 'content', 'audit', 'system'])
    assert.match(page, new RegExp(`adminApi\\s*\\.${method}`, 'u'));
  assert.match(page, /Suspend/u);
  assert.match(page, /Reactivate/u);
  assert.match(page, /Administrative reason/u);
  assert.match(page, /Filter moderation visibility/u);
  assert.match(page, /Confirm action/u);
  assert.match(page, /moderationVisibility/u);
  assert.match(page, /Skeleton/u);
  assert.match(page, /EmptyState/u);
});
void test('admin UI states privacy and schema-dependent restrictions explicitly', async () => {
  const page = await source('features/admin/AdminPage.tsx');
  assert.match(page, /Private encrypted message inspection: unavailable/u);
  assert.match(
    page,
    /Content moderation visibility: additive migration prepared; live approval pending/u,
  );
  assert.match(page, /never invoke paid inference/u);
  assert.doesNotMatch(page, /encryptedContent|MESSAGE_ENCRYPTION_KEY|ADMIN_ALLOWED_USER_ID/u);
  assert.match(page, /cc-field/u);
  assert.match(page, /cc-section-nav-item--active/u);
});
