import { safePhoto } from '../profile/profile-avatar-value';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import type { ProfileAvatar as ProfileAvatarValue } from '../profile/profile.types';

const avatarIds = new Set(['campus-indigo', 'campus-cyan', 'campus-amber', 'campus-rose']);

const isProfileAvatar = (value: unknown): value is ProfileAvatarValue => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!('id' in value) || !('type' in value)) return false;
  if (safePhoto(value)) return true;
  return value.type === 'predefined' && typeof value.id === 'string' && avatarIds.has(value.id);
};

export function StudentAvatar({ avatar, displayName }: { avatar: unknown; displayName: string }) {
  return (
    <ProfileAvatar
      avatar={isProfileAvatar(avatar) ? avatar : null}
      fallback={displayName}
      size="small"
    />
  );
}
