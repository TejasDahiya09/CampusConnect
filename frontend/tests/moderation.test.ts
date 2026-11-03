import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath: string) =>
  readFile(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');

void test('all supported public detail experiences expose the shared report action', async () => {
  const files = await Promise.all([
    source('features/marketplace/MarketplaceListingDetail.tsx'),
    source('features/lost-found/LostFoundReportDetail.tsx'),
    source('features/teamup/TeamUpDetail.tsx'),
    source('features/services/ServiceDetail.tsx'),
    source('features/profile/PublicProfilePage.tsx'),
  ]);
  for (const content of files) assert.match(content, /<ReportAction/u);
  for (const target of ['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE', 'PROFILE'])
    assert.ok(files.some((content) => content.includes(`targetType="${target}"`)));
});

void test('report dialog is bounded, accessible, and provides success and duplicate feedback', async () => {
  const content = await source('features/moderation/ReportAction.tsx');
  assert.match(content, /maxLength=\{1000\}/u);
  assert.match(content, /aria-label|<label/u);
  assert.match(content, /Spam or misleading content/u);
  assert.match(content, /Privacy violation/u);
  assert.match(content, /Your report was submitted/u);
  assert.match(content, /ApiClientError/u);
});

void test('moderation workspace is role protected and supports operational queue states', async () => {
  const [app, shell, page] = await Promise.all([
    source('app/App.tsx'),
    source('app/AppShell.tsx'),
    source('features/moderation/ModerationPage.tsx'),
  ]);
  assert.match(app, /function ModeratorRoute/u);
  assert.match(app, /path="\/moderation"/u);
  assert.match(
    shell,
    /applicationUser\?\.role === 'MODERATOR' \|\| applicationUser\?\.role === 'ADMIN'/u,
  );
  for (const evidence of [
    'Search reports',
    'Filter by status',
    'Filter by reason',
    'Filter by target type',
    'Queue is clear',
    'Mark under review',
    'Dismiss report',
    'Resolve violation',
  ])
    assert.ok(page.includes(evidence));
  assert.match(page, /Skeleton/u);
  assert.match(page, /role="alert"/u);
});
