import type { PredefinedAvatarId } from './profile.types';

export const predefinedAvatars: ReadonlyArray<{
  readonly id: PredefinedAvatarId;
  readonly label: string;
}> = [
  { id: 'campus-indigo', label: 'Indigo scholar' },
  { id: 'campus-cyan', label: 'Cyan explorer' },
  { id: 'campus-amber', label: 'Amber creator' },
  { id: 'campus-rose', label: 'Rose collaborator' },
];
