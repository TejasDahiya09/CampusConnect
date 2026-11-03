import { useSyncExternalStore } from 'react';
import { ownAvatar, subscribeOwnAvatar } from './own-avatar';
import { safePhoto } from './profile-avatar-value';
import { ProfileAvatar } from './ProfileAvatar';
export function AccountAvatar({
  id,
  avatar,
  fallback,
}: {
  id: string;
  avatar: unknown;
  fallback: string;
}) {
  const updated = useSyncExternalStore(
    subscribeOwnAvatar,
    () => ownAvatar(id),
    () => undefined,
  );
  const current = updated ? updated.avatar : avatar;
  return safePhoto(current) ? (
    <ProfileAvatar avatar={current} fallback={fallback} size="small" />
  ) : (
    <>{fallback || 'CC'}</>
  );
}
