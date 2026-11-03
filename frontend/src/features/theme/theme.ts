export const themeStorageKey = 'campusconnect-theme';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemeMode {
  const stored = storage.getItem(themeStorageKey);
  return isThemeMode(stored) ? stored : 'dark';
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  return mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;
}

export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#070b14' : '#f5f7fb');
}
