import type { ProfileAvatar } from './profile.types';
const values = new Map<string, { avatar: ProfileAvatar | null }>();
const listeners = new Set<() => void>();
export function publishOwnAvatar(id: string, avatar: ProfileAvatar | null) {
  if (values.size >= 32 && !values.has(id)) {
    const first = values.keys().next().value;
    if (first) values.delete(first);
  }
  values.set(id, { avatar });
  for (const notify of listeners) notify();
}
export const ownAvatar = (id: string) => values.get(id);
export const subscribeOwnAvatar = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

export function clearOwnAvatar(id: string) {
  if (values.delete(id)) for (const notify of listeners) notify();
}
