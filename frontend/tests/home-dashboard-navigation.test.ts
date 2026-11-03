import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { navigationGroups, pageContextForPath, pageTitleForPath } from '../src/app/app-navigation';
import {
  hasDashboardActivity,
  type DashboardAnalytics,
} from '../src/features/dashboard/dashboard-service';
import {
  firstName,
  greetingForHour,
  homeLayoutState,
  homeQuickActions,
  shouldPromptForProfile,
} from '../src/features/home/home-service';
void test('Home personalization and creation actions remain deterministic', () => {
  assert.equal(firstName('Rahul Student'), 'Rahul');
  assert.equal(firstName(' '), 'Student');
  assert.equal(greetingForHour(8), 'Good morning');
  assert.equal(greetingForHour(14), 'Good afternoon');
  assert.equal(greetingForHour(20), 'Good evening');
  assert.equal(shouldPromptForProfile(79), true);
  assert.equal(shouldPromptForProfile(80), false);
  assert.deepEqual(
    homeQuickActions.map(({ path }) => path),
    ['/marketplace/new', '/lost-found/new', '/teamup/new', '/services/new'],
  );
  assert.deepEqual(
    homeQuickActions.map(({ kind }) => kind),
    ['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'],
  );
});

void test('Home layout state follows attention, active-work, and first-session precedence', () => {
  const item = { id: 'one', kind: 'MARKETPLACE' as const, path: '/marketplace/one', title: 'One' };
  assert.equal(homeLayoutState({ attentionItems: [item], continueItems: [item] }), 'ATTENTION');
  assert.equal(homeLayoutState({ attentionItems: [], continueItems: [item] }), 'CONTINUE');
  assert.equal(homeLayoutState({ attentionItems: [], continueItems: [] }), 'FIRST_SESSION');
  assert.equal(homeLayoutState({ attentionItems: [item], continueItems: [] }), 'ATTENTION');
});
void test('navigation exposes every completed student destination without Admin', () => {
  const paths = navigationGroups.flatMap(({ items }) => items.map(({ path }) => path));
  assert.deepEqual(paths, [
    '/home',
    '/dashboard',
    '/marketplace',
    '/lost-found',
    '/teamup',
    '/services',
    '/search',
    '/assistant',
    '/messages',
    '/notifications',
    '/profile',
    '/settings',
  ]);
  assert.equal(paths.includes('/admin'), false);
  assert.equal(pageTitleForPath('/home'), 'Home');
  assert.equal(pageTitleForPath('/dashboard'), 'Dashboard');
  assert.equal(pageTitleForPath('/services/example'), 'Services');
  assert.equal(pageContextForPath('/home'), 'Your CampusConnect home');
  assert.equal(pageContextForPath('/dashboard'), 'Your activity and insights');
});
void test('student dashboard detects truthful zero and nonzero activity states', () => {
  const zero: DashboardAnalytics = {
    metrics: [
      {
        detail: '0 sold',
        id: 'marketplace',
        label: 'Active listings',
        path: '/marketplace',
        value: 0,
      },
    ],
    insights: {
      communication: { unreadMessages: 0 },
      lostFound: { open: 0, resolved: 0 },
      marketplace: { active: 0, sold: 0 },
      services: { completedRequests: 0, pendingRequests: 0 },
      teamUp: { completed: 0, owned: 0 },
    },
  };
  assert.equal(hasDashboardActivity(zero), false);
  assert.equal(
    hasDashboardActivity({
      ...zero,
      insights: { ...zero.insights, communication: { unreadMessages: 1 } },
    }),
    true,
  );
});

void test('premium shell and Home preserve accessible navigation and real destinations', async () => {
  const [shell, home, homeStyles, dashboard] = await Promise.all([
    readFile(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/home/HomePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/home/home.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/dashboard/DashboardContent.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(shell, /cc-shell-brand/);
  assert.match(shell, /pageTitleForPath\(location\.pathname\)/);
  assert.match(shell, /GlobalSearch/);
  assert.match(shell, /NotificationBell/);
  assert.match(shell, /<PublicThemeToggle \/>/u);
  assert.match(home, /homeLayoutState\(data\)/);
  assert.match(home, /cc-home-action-grid/);
  assert.match(home, /data\.attentionItems/);
  assert.match(home, /data\.discoverItems/);
  assert.match(home, /data\.continueItems/);
  assert.match(home, /Discover across campus/);
  assert.doesNotMatch(home, /Recommended for you|Trending|AI-picked/);
  assert.match(home, /role="progressbar"/);
  assert.match(home, /We couldn’t load Home/);
  assert.match(home, /className="cc-home-mobile-assistant" to="\/assistant"/u);
  assert.doesNotMatch(home, /Your workspace is ready/u);
  assert.match(home, /<ActionArea \/>/u);
  assert.match(
    homeStyles,
    /@media \(max-width: 699px\)[\s\S]*\.cc-home-action-tile\s*\{[\s\S]*flex-direction: column/u,
  );
  assert.match(homeStyles, /\.cc-home-discover-card\s*\{[\s\S]*min-height: 6\.25rem/u);
  assert.match(homeStyles, /\.cc-home-mobile-assistant\s*\{[\s\S]*display: none/u);
  assert.match(
    homeStyles,
    /@media \(max-width: 699px\)[\s\S]*\.cc-home-mobile-assistant\s*\{[\s\S]*display: flex/u,
  );
  assert.match(
    homeStyles,
    /@media \(max-width: 699px\)[\s\S]*\.cc-home-profile-prompt\s*\{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\)[\s\S]*\.cc-home-profile-prompt > \.cc-home-section-link\s*\{[\s\S]*grid-column: 1 \/ -1/u,
  );
  assert.match(dashboard, /hasDashboardActivity\(data\)/);
  assert.equal(home.includes('bg-[#070b14]'), false);
});
