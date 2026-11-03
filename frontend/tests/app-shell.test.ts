import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  mobilePrimary,
  primaryNavigation,
  routeMatches,
  workspaceNavigation,
} from '../src/app/app-navigation';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

void test('authenticated shell exposes the approved core and mobile navigation', () => {
  assert.deepEqual(
    primaryNavigation.map(({ path }) => path),
    ['/home', '/dashboard', '/marketplace', '/lost-found', '/teamup', '/services'],
  );
  assert.deepEqual(
    mobilePrimary.map(({ path }) => path),
    ['/home', '/marketplace', '/search', '/assistant', '/messages', '/profile'],
  );
  assert.ok(workspaceNavigation.some(({ path }) => path === '/assistant'));
  assert.ok(workspaceNavigation.some(({ path }) => path === '/settings'));
  assert.equal(
    [...primaryNavigation, ...workspaceNavigation].filter(({ path }) => path === '/dashboard')
      .length,
    1,
  );
});

void test('nested routes retain their parent module active state', () => {
  assert.equal(routeMatches('/marketplace/listing-id/edit', '/marketplace'), true);
  assert.equal(routeMatches('/lost-found/report-id', '/lost-found'), true);
  assert.equal(routeMatches('/teamup/project-id', '/teamup'), true);
  assert.equal(routeMatches('/services/service-id', '/services'), true);
  assert.equal(routeMatches('/messages/conversation-id', '/messages'), true);
  assert.equal(routeMatches('/marketplace', '/home'), false);
  assert.equal(routeMatches('/dashboard', '/dashboard'), true);
  assert.equal(routeMatches('/home', '/dashboard'), false);
});

void test('shell preserves role gates, existing integrations, logout and one search instance', async () => {
  const shell = await source('app/AppShell.tsx');
  assert.match(
    shell,
    /applicationUser\?\.role === 'MODERATOR' \|\| applicationUser\?\.role === 'ADMIN'/u,
  );
  assert.match(shell, /applicationUser\?\.role === 'ADMIN' && adminAuthorized/u);
  assert.match(shell, /adminApi\.access\(\)/u);
  assert.match(shell, /<GlobalSearch/u);
  assert.equal(shell.match(/<GlobalSearch/g)?.length, 1);
  assert.match(shell, /<NotificationBell/u);
  assert.match(shell, /path="\/messages"/u);
  assert.match(shell, /await logout\(\)/u);
  assert.match(shell, /navigate\('\/login', \{ replace: true \}\)/u);
  assert.doesNotMatch(shell, /unreadMessages|fakeUnread|messageCount/u);
});

void test('menus and Explore sheet implement dismissal, focus and scroll cleanup', async () => {
  const shell = await source('app/AppShell.tsx');
  assert.match(shell, /aria-haspopup="dialog"/u);
  assert.match(shell, /role="dialog"/u);
  assert.match(shell, /aria-modal="true"/u);
  assert.match(shell, /containFocus\(event, panel\.current\)/u);
  assert.match(shell, /document\.body\.style\.overflow = previousOverflow/u);
  assert.match(shell, /matchMedia\('\(min-width: 1340px\)'\)/u);
  assert.match(shell, /desktop\.addEventListener\('change'/u);
  assert.match(shell, /document\.addEventListener\('mousedown'/u);
  assert.match(shell, /trigger\.current\?\.focus\(\)/u);
});

void test('mobile shell reserves safe-area clearance without duplicating page padding', async () => {
  const styles = await source('app/app-shell.css');
  assert.match(styles, /--cc-mobile-nav-height: 4\.15rem/u);
  assert.match(
    styles,
    /\.cc-app-shell main\s*\{[\s\S]*var\(--cc-mobile-nav-height\)[\s\S]*env\(safe-area-inset-bottom\)[\s\S]*\+ 1rem/u,
  );
  assert.match(
    styles,
    /\.cc-mobile-nav\s*\{[\s\S]*min-height: calc\(var\(--cc-mobile-nav-height\) \+ env\(safe-area-inset-bottom\)\)/u,
  );
  assert.match(styles, /\.cc-app-shell \.cc-page\s*\{[\s\S]*padding-bottom: 1\.5rem/u);
  assert.match(styles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/u);
});

void test('mobile navigation uses a solid integrated surface and stable destinations', async () => {
  const styles = await source('app/app-shell.css');
  assert.match(styles, /\.cc-mobile-nav\s*\{[^}]*background: var\(--cc-panel\)/u);
  assert.match(styles, /border-top: 1px solid var\(--cc-border-strong\)/u);
  assert.doesNotMatch(styles, /\.cc-mobile-nav\s*\{[^}]*backdrop-filter/u);
  assert.deepEqual(
    mobilePrimary.map(({ path }) => path),
    ['/home', '/marketplace', '/search', '/assistant', '/messages', '/profile'],
  );
});

void test('account menu is opaque, viewport-contained and preserves authorized actions', async () => {
  const [shell, styles] = await Promise.all([
    source('app/AppShell.tsx'),
    source('app/app-shell.css'),
  ]);
  assert.match(
    styles,
    /\.cc-shell-account-menu\s*\{[^}]*width: min\(17\.5rem, calc\(100vw - 1\.25rem\)\)/u,
  );
  assert.match(styles, /max-height: calc\(100dvh - 5\.5rem\)/u);
  assert.match(styles, /\.cc-shell-account-menu\s*\{[^}]*background: var\(--cc-panel\)/u);
  assert.match(styles, /backdrop-filter: none/u);
  for (const action of ['My Profile', 'Settings', 'Sign out']) assert.ok(shell.includes(action));
  assert.doesNotMatch(shell, /visit\('\/dashboard'\)/u);
  assert.match(shell, /applicationUser\.role === 'ADMIN' && adminAuthorized/u);
});

void test('mobile section headers stack copy and actions without narrow columns', async () => {
  const [styles, home, homeStyles] = await Promise.all([
    source('index.css'),
    source('features/home/HomePage.tsx'),
    source('features/home/home.css'),
  ]);
  assert.match(styles, /\.cc-section-header\s*\{[\s\S]*min-width: 0/u);
  assert.match(
    styles,
    /@media \(max-width: 639px\)[\s\S]*\.cc-section-header\s*\{[\s\S]*flex-direction: column[\s\S]*align-items: flex-start/u,
  );
  assert.match(styles, /\.cc-section-header \.cc-page-actions\s*\{[\s\S]*width: auto/u);
  assert.match(home, /title="Discover across campus"/u);
  assert.match(home, /to="\/search"[\s\S]*Search all/u);
  assert.match(
    homeStyles,
    /@media \(max-width: 699px\)[\s\S]*\.cc-home-section-heading\s*\{[\s\S]*align-items: flex-start/u,
  );
});

void test('authenticated appearance uses the direct persisted Light and Dark toggle', async () => {
  const shell = await source('app/AppShell.tsx');
  assert.match(shell, /<PublicThemeToggle \/>/u);
  assert.doesNotMatch(shell, /AppearanceMenu|menuitemradio|value: 'system'/u);
});

void test('mobile Assistant moves to bottom navigation while desktop utilities remain available', async () => {
  const [shell, styles] = await Promise.all([
    source('app/AppShell.tsx'),
    source('app/app-shell.css'),
  ]);
  assert.match(shell, /icon="ai" label="Campus Assistant" path="\/assistant"/u);
  assert.match(
    shell,
    /className=\{\(\{ isActive \}\) => cn\('cc-shell-utility', isActive && 'is-active'\)\}/u,
  );
  assert.match(styles, /--cc-shell-control-size: 2\.75rem/u);
  assert.match(styles, /--cc-shell-icon-size: 1\.2rem/u);
  assert.match(
    styles,
    /\.cc-shell-utility,[\s\S]*\.cc-shell-avatar,[\s\S]*\.cc-top-nav \.cc-icon-button,[\s\S]*\.cc-shell-theme \.cc-public-theme-toggle\s*\{[\s\S]*width: var\(--cc-shell-control-size\)[\s\S]*height: var\(--cc-shell-control-size\)/u,
  );
  assert.match(styles, /\.cc-shell-assistant\s*\{\s*display: block/u);
  assert.match(
    styles,
    /@media \(max-width: 767px\)\s*\{\s*\.cc-shell-search-trigger,\s*\.cc-shell-assistant,\s*\.cc-shell-search\.is-open\s*\{\s*display: none/u,
  );
  assert.doesNotMatch(styles, /top: 7\.45rem|top: 7\.8rem/u);
  assert.match(
    shell,
    /aria-label=\{item\.path === '\/assistant' \? 'Campus Assistant' : item\.label\}/u,
  );
  assert.equal(mobilePrimary.find(({ path }) => path === '/assistant')?.icon, 'ai');
  assert.equal(mobilePrimary.length, 6);
  assert.equal(mobilePrimary.find(({ path }) => path === '/assistant')?.label, 'Assistant');
  assert.equal(mobilePrimary.find(({ path }) => path === '/search')?.icon, 'search');
  assert.equal(routeMatches('/search', '/search'), true);
  assert.equal(routeMatches('/assistant', '/search'), false);
  assert.match(
    styles,
    /@media \(max-width: 359px\)[\s\S]*padding-inline: 0\.125rem[\s\S]*font-size: 0\.56rem/u,
  );
  assert.equal(routeMatches('/assistant', '/assistant'), true);
  assert.equal(routeMatches('/home', '/assistant'), false);
  assert.match(
    styles,
    /@media \(max-width: 430px\)[\s\S]*\.cc-shell-explore-trigger\s*\{[\s\S]*width: var\(--cc-shell-control-size\)/u,
  );
});

void test('mobile search and notification overlays remain within viewport gutters', async () => {
  const [styles, search, notifications] = await Promise.all([
    source('app/app-shell.css'),
    source('features/search/GlobalSearch.tsx'),
    source('features/notifications/NotificationBell.tsx'),
  ]);
  assert.match(search, /cc-global-search-form/u);
  assert.match(search, /cc-global-search-icon/u);
  assert.match(search, /className="cc-global-search-input"/u);
  assert.doesNotMatch(search, /className="cc-field[^"]*pl-9/u);
  assert.match(search, /cc-global-search-results/u);
  assert.match(notifications, /cc-notification-panel/u);
  assert.match(notifications, /cc-notification-header/u);
  assert.match(
    styles,
    /@media \(max-width: 767px\)[\s\S]*\.cc-shell-search\s*\{[\s\S]*position: fixed[\s\S]*right: 0\.75rem[\s\S]*left: 0\.75rem/u,
  );
  assert.match(
    styles,
    /\.cc-notification-panel\s*\{[\s\S]*position: fixed[\s\S]*right: 0\.75rem[\s\S]*left: 0\.75rem[\s\S]*width: auto/u,
  );
});

void test('Global Search reserves a dedicated icon slot across authenticated layouts', async () => {
  const styles = await source('app/app-shell.css');
  assert.match(
    styles,
    /\.cc-global-search-form\s*\{[\s\S]*display: flex[\s\S]*align-items: center[\s\S]*gap: 0\.55rem/u,
  );
  assert.match(styles, /\.cc-global-search-icon\s*\{[\s\S]*flex: 0 0 auto/u);
  assert.match(
    styles,
    /\.cc-global-search-input\s*\{[\s\S]*min-width: 0[\s\S]*border: 0[\s\S]*padding: 0/u,
  );
  assert.match(styles, /\.cc-global-search-form:focus-within/u);
});

void test('mobile search uses readable text sizing and bounded input space', async () => {
  const [styles, search, page, home] = await Promise.all([
    source('app/app-shell.css'),
    source('features/search/GlobalSearch.tsx'),
    source('features/search/SearchPage.tsx'),
    source('features/home/HomePage.tsx'),
  ]);
  assert.match(
    styles,
    /\.cc-global-search-input,\s*\.cc-search-page-input\s*\{\s*font-size: 1rem;\s*line-height: 1\.5/u,
  );
  assert.match(page, /cc-search-page-input min-w-0 flex-1/u);
  assert.match(page, /placeholder="Search campus"/u);
  assert.match(search, /placeholder="Search CampusConnect"/u);
  assert.match(home, /to="\/search"/u);
});

void test('Search owns one outer focus treatment and desktop utilities cannot wrap', async () => {
  const styles = await source('app/app-shell.css');
  const declaration = (selector: string) => {
    const start = styles.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `Missing selector ${selector}`);
    return styles.slice(start, styles.indexOf('}', start));
  };
  const inputFocus = declaration('.cc-global-search-input:focus-visible');
  assert.match(inputFocus, /outline: none/u);
  assert.match(inputFocus, /box-shadow: none/u);
  assert.match(declaration('.cc-global-search-form:focus-within'), /box-shadow: 0 0 0 3px/u);
  assert.match(declaration('.cc-shell-utility-label'), /white-space: nowrap/u);
  assert.match(declaration('.cc-shell-utilities'), /flex: 0 0 auto/u);
  const fullHeader = styles.slice(styles.indexOf('@media (min-width: 1340px)'));
  assert.match(fullHeader, /flex: 1 1 14rem/u);
  assert.match(fullHeader, /min-width: 12rem/u);
  assert.match(fullHeader, /max-width: 16rem/u);
  assert.match(fullHeader, /@media \(min-width: 1600px\)/u);
  assert.doesNotMatch(fullHeader, /min-width: 1450px/u);
});

void test('authenticated shell palette is scoped and does not replace approved auth tokens', async () => {
  const [styles, loginStyles] = await Promise.all([
    source('app/app-shell.css'),
    source('features/auth/login.css'),
  ]);
  assert.match(styles, /\.cc-app-shell\s*\{[\s\S]*--cc-primary: #a5adff/u);
  assert.match(styles, /:root\[data-theme='light'\] \.cc-app-shell/u);
  assert.match(loginStyles, /--login-primary: #a5adff/u);
  assert.match(loginStyles, /:root\[data-theme='light'\] \.cc-login-page/u);
});

void test('Explore keeps compact grouped navigation and viewport-safe geometry', async () => {
  const [shell, styles] = await Promise.all([
    source('app/AppShell.tsx'),
    source('app/app-shell.css'),
  ]);
  for (const label of ['Core modules', 'Workspace', 'Privileged']) assert.ok(shell.includes(label));
  assert.match(styles, /width: min\(27rem, calc\(100vw - 1rem\)\)/u);
  assert.doesNotMatch(styles, /width: min\(42rem, 88vw\)/u);
});

void test('shell-visible source contains no known mojibake sequences', async () => {
  const values = await Promise.all([
    source('app/AppShell.tsx'),
    source('app/app-navigation.ts'),
    source('features/search/GlobalSearch.tsx'),
    source('features/notifications/NotificationBell.tsx'),
  ]);
  for (const value of values) assert.doesNotMatch(value, /â€¦|â€™|â€”|Ã|Â|�/u);
});
