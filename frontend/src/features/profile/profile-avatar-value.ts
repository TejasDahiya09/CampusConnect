import type { ProfileAvatar } from './profile.types';
export function safePhoto(value: unknown): value is Extract<ProfileAvatar, { type: 'photo' }> {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  if (
    a.type !== 'photo' ||
    typeof a.id !== 'string' ||
    typeof a.url !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(a.id)
  )
    return false;
  try {
    const u = new URL(a.url);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === `/profile-photos/${a.id}.png`
    );
  } catch {
    return false;
  }
}
