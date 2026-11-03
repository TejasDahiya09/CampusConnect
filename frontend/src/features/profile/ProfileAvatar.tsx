import { useState } from 'react';
import { safePhoto } from './profile-avatar-value';
import type { PredefinedAvatarId, ProfileAvatar as ProfileAvatarValue } from './profile.types';

const avatarClasses: Readonly<Record<PredefinedAvatarId, string>> = {
  'campus-indigo': 'from-indigo-400 to-violet-700 text-indigo-50',
  'campus-cyan': 'from-cyan-300 to-blue-700 text-cyan-950',
  'campus-amber': 'from-amber-300 to-orange-600 text-amber-950',
  'campus-rose': 'from-rose-300 to-fuchsia-700 text-rose-950',
};

const avatarSymbols: Readonly<Record<PredefinedAvatarId, string>> = {
  'campus-indigo': 'CC',
  'campus-cyan': '✦',
  'campus-amber': 'A+',
  'campus-rose': '∞',
};

export function ProfileAvatar({
  avatar,
  fallback,
  size = 'large',
}: {
  readonly avatar: ProfileAvatarValue | null;
  readonly fallback: string;
  readonly size?: 'large' | 'small';
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = safePhoto(avatar) && avatar.url !== failed ? avatar : null;
  const preset = avatar?.type === 'predefined' ? avatar : null;
  const dimensions =
    size === 'large' ? 'size-24 rounded-3xl text-2xl' : 'size-10 rounded-full text-xs';
  const content =
    preset === null ? fallback.slice(0, 2).toUpperCase() || 'CC' : avatarSymbols[preset.id];
  const colors =
    preset === null ? 'from-slate-700 to-slate-900 text-cyan-200' : avatarClasses[preset.id];

  return (
    <span
      aria-label={
        photo
          ? 'Profile photo'
          : preset
            ? `Selected avatar: ${preset.id}`
            : 'Default profile avatar'
      }
      className={`relative overflow-hidden grid shrink-0 place-items-center bg-gradient-to-br font-bold shadow-xl ${dimensions} ${colors}`}
      role="img"
    >
      {photo ? (
        <img
          src={photo.url}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(photo.url)}
        />
      ) : (
        content
      )}
    </span>
  );
}
