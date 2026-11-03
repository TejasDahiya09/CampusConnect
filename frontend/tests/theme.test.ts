import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isThemeMode,
  readThemePreference,
  resolveTheme,
  themeStorageKey,
} from '../src/features/theme/theme';

void test('theme preference accepts only Light, Dark, and System modes', () => {
  assert.equal(isThemeMode('light'), true);
  assert.equal(isThemeMode('dark'), true);
  assert.equal(isThemeMode('system'), true);
  assert.equal(isThemeMode('contrast'), false);
});

void test('theme preference persists under the stable application key and defaults to dark', () => {
  assert.equal(themeStorageKey, 'campusconnect-theme');
  assert.equal(readThemePreference({ getItem: () => 'light' }), 'light');
  assert.equal(readThemePreference({ getItem: () => 'system' }), 'system');
  assert.equal(readThemePreference({ getItem: () => 'invalid' }), 'dark');
  assert.equal(readThemePreference({ getItem: () => null }), 'dark');
});

void test('System mode follows both operating-system preferences', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

void test('theme initializes before React and controls are accessible in shell and Settings', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(
    new URL('../src/features/settings/SettingsPage.tsx', import.meta.url),
    'utf8',
  );
  const control = readFileSync(
    new URL('../src/components/PublicThemeToggle.tsx', import.meta.url),
    'utf8',
  );

  assert.ok(html.indexOf('campusconnect-theme') < html.indexOf('/src/main.tsx'));
  assert.match(main, /<ThemeProvider>/);
  assert.match(shell, /<PublicThemeToggle \/>/u);
  assert.doesNotMatch(shell, /role="menuitemradio"/u);
  assert.match(settings, /<PublicThemeToggle \/>/u);
  assert.match(control, /resolvedTheme === 'light' \? 'dark' : 'light'/u);
  assert.match(control, /Switch to/u);
});

void test('critical light-mode surfaces use semantic theme classes', () => {
  const shell = readFileSync(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/features/home/HomePage.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(
    new URL('../src/features/dashboard/DashboardContent.tsx', import.meta.url),
    'utf8',
  );
  const styles = `${readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')}\n${readFileSync(new URL('../src/app/app-shell.css', import.meta.url), 'utf8')}\n${readFileSync(new URL('../src/features/home/home.css', import.meta.url), 'utf8')}`;

  assert.match(shell, /cc-top-nav/);
  assert.match(shell, /cc-shell-dropdown/);
  assert.doesNotMatch(shell, /bg-\[#070b14\]\/90/);
  assert.match(home, /cc-home-continue-list/);
  assert.doesNotMatch(home, /bg-slate-900\/55/);
  assert.match(dashboard, /cc-metric-card/);
  assert.doesNotMatch(dashboard, /bg-slate-900\/60/);
  assert.match(styles, /--cc-bg: #f7f6f2/);
  assert.match(styles, /--cc-header: rgba\(247, 246, 242, 0\.9\)/);
  assert.match(styles, /\.cc-top-nav[\s\S]*var\(--cc-header\)/);
  assert.match(styles, /\.cc-metric-card/);
  assert.match(styles, /\.cc-home-continue-item/);
});
