import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

void test('feature routes are lazy while authentication and authorization guards remain eager', async () => {
  const [app, shell] = await Promise.all([source('app/App.tsx'), source('app/AppShell.tsx')]);
  for (const feature of [
    'AdminPage',
    'AIAssistantPage',
    'LostFoundPages',
    'MarketplacePage',
    'MessagesPage',
    'ModerationPage',
    'ProfilePage',
    'ServicePages',
    'TeamUpPages',
  ])
    assert.match(app, new RegExp(`import\\('../features/.+${feature}`, 'u'));
  assert.ok(app.includes('<ProtectedRoute loadingFallback={<LoadingScreen />}>'));
  assert.match(app, /adminApi\s*\.access/u);
  assert.ok(shell.includes('<Suspense fallback={<RouteLoadingFallback />}>'));
  assert.match(shell, /aria-live="polite"/u);
});

void test('application shell has accessible responsive navigation behavior', async () => {
  const [shell, navigation, styles] = await Promise.all([
    source('app/AppShell.tsx'),
    source('app/app-navigation.ts'),
    source('app/app-shell.css'),
  ]);
  assert.match(shell, /Skip to main content/u);
  assert.match(shell, /aria-label="Primary application navigation"/u);
  assert.match(shell, /aria-label="Mobile navigation"/u);
  assert.match(shell, /aria-modal="true"/u);
  assert.match(shell, /containFocus/u);
  assert.match(shell, /restoreFocus\?\.focus/u);
  assert.match(shell, /document\.body\.style\.overflow = 'hidden'/u);
  assert.match(shell, /document\.body\.style\.overflow = previousOverflow/u);
  assert.match(shell, /event\.key === 'Escape'/u);
  assert.match(shell, /cc-mobile-nav-link--active/u);
  assert.match(navigation, /export const primaryNavigation/u);
  assert.match(navigation, /routeMatches/u);
  assert.match(styles, /@media \(min-width: 1340px\)/u);
  assert.match(styles, /env\(safe-area-inset-bottom\)/u);
});

void test('shared buttons and dialogs expose loading, labelling, focus trapping and restoration', async () => {
  const ui = await source('components/ui.tsx');
  assert.ok(ui.includes('aria-busy={loading || undefined}'));
  assert.ok(ui.includes('disabled={disabled || loading}'));
  assert.ok(ui.includes('aria-labelledby={titleId}'));
  assert.ok(ui.includes('aria-describedby={description ? descriptionId : undefined}'));
  assert.match(ui, /event\.key !== 'Tab'/u);
  assert.match(ui, /previousFocus\?\.focus\(\)/u);
  assert.match(ui, /document\.body\.style\.overflow = previousOverflow/u);
});

void test('student feature modules share responsive cards, filters, actions and pagination', async () => {
  const [styles, marketplace, lostFound, teamUp, services] = await Promise.all([
    source('index.css'),
    source('features/marketplace/ListingCard.tsx'),
    source('features/lost-found/LostFoundCard.tsx'),
    source('features/teamup/TeamUpBrowse.tsx'),
    source('features/services/ServicePages.tsx'),
  ]);

  assert.match(styles, /\.cc-feature-card/u);
  assert.match(styles, /\.cc-filter-grid/u);
  assert.match(styles, /\.cc-page-actions/u);
  assert.match(styles, /\.cc-pagination/u);
  assert.match(styles, /overflow-wrap: anywhere/u);
  assert.match(marketplace, /cc-feature-card/u);
  assert.match(lostFound, /cc-feature-card/u);
  assert.match(teamUp, /TeamUpProjectCard/u);
  assert.match(teamUp, /TeamUpFilters/u);
  assert.match(services, /ServicesWorkspace/u);
  assert.match(services, /ServicesBrowse/u);
});

void test('administration tables and chat workspaces expose responsive accessible foundations', async () => {
  const [styles, admin, moderation, messages, assistant] = await Promise.all([
    source('index.css'),
    source('features/admin/AdminPage.tsx'),
    source('features/moderation/ModerationPage.tsx'),
    source('features/messaging/MessagesPage.tsx'),
    source('features/ai/AIAssistantPage.tsx'),
  ]);

  assert.match(styles, /\.cc-table-scroll/u);
  assert.match(styles, /\.cc-section-nav/u);
  assert.match(styles, /\.cc-chat-workspace/u);
  assert.match(styles, /\.cc-message-bubble/u);
  assert.match(admin, /aria-label="User management table"[\s\S]*tabIndex=\{0\}/u);
  assert.match(admin, /aria-label="Content inventory table"[\s\S]*tabIndex=\{0\}/u);
  assert.match(moderation, /aria-label="Moderation reports table"[\s\S]*tabIndex=\{0\}/u);
  assert.match(messages, /cc-msg-workspace/u);
  assert.match(messages, /cc-msg-bubble/u);
  assert.match(messages, /role="alert"/u);
  assert.match(assistant, /cc-chat-workspace/u);
  assert.match(assistant, /cc-message-bubble/u);
});

void test('premium foundation defines semantic tokens and reusable feedback primitives', async () => {
  const [styles, ui] = await Promise.all([source('index.css'), source('components/ui.tsx')]);

  for (const token of [
    '--cc-panel-muted',
    '--cc-border-strong',
    '--cc-primary-soft',
    '--cc-shadow-sm',
    '--cc-shadow-md',
    '--cc-shadow-lg',
    '--cc-reading-width',
  ]) {
    assert.match(styles, new RegExp(token, 'u'));
  }
  assert.match(styles, /\.cc-choice/u);
  assert.match(styles, /\.cc-alert/u);
  assert.match(styles, /\.cc-toast/u);
  assert.match(styles, /\.cc-section-header/u);
  assert.match(ui, /export function SectionHeader/u);
  assert.match(ui, /export function FieldMessage/u);
  assert.match(ui, /export function InlineAlert/u);
  assert.match(ui, /role=\{tone === 'danger' \? 'alert' : 'status'\}/u);
});
