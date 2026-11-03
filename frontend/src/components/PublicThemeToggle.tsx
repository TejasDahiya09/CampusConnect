import { useTheme } from '../features/theme/useTheme';
import { Icon } from './Icon';

export function PublicThemeToggle() {
  const { resolvedTheme, setMode } = useTheme();
  const next = resolvedTheme === 'light' ? 'dark' : 'light';
  return (
    <button
      aria-label={`Switch to ${next} mode`}
      className="cc-public-theme-toggle"
      onClick={() => setMode(next)}
      title={`Switch to ${next} mode`}
      type="button"
    >
      <Icon name={resolvedTheme === 'light' ? 'moon' : 'sun'} />
      <span>{resolvedTheme === 'light' ? 'Dark' : 'Light'}</span>
    </button>
  );
}
