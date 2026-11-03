export const predefinedAvatarIds = [
  'campus-indigo',
  'campus-cyan',
  'campus-amber',
  'campus-rose',
] as const;

export type PredefinedAvatarId = (typeof predefinedAvatarIds)[number];

export const isPredefinedAvatarId = (value: unknown): value is PredefinedAvatarId =>
  typeof value === 'string' && predefinedAvatarIds.some((id) => id === value);
