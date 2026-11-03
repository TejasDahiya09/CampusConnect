import type { PredefinedAvatarId } from './profile-avatars.js';
import { isPredefinedAvatarId } from './profile-avatars.js';
import { getCloudFrontDeliveryUrl } from '../../services/storage/cloudfront-url.js';
export interface PredefinedAvatar {
  type: 'predefined';
  id: PredefinedAvatarId;
}
export interface PhotoAvatar {
  type: 'photo';
  id: string;
  url: string;
}
export interface StoredPhoto {
  type: 'photo';
  id: string;
  objectKey: string;
  fallback: PredefinedAvatar | null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const predefinedAvatar = (v: unknown): PredefinedAvatar | null => {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  return a.type === 'predefined' && isPredefinedAvatarId(a.id)
    ? { type: 'predefined', id: a.id }
    : null;
};
export const storedPhoto = (v: unknown): StoredPhoto | null => {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  return a.type === 'photo' &&
    typeof a.id === 'string' &&
    uuid.test(a.id) &&
    a.objectKey === `profile-photos/${a.id}.png`
    ? { type: 'photo', id: a.id, objectKey: a.objectKey, fallback: predefinedAvatar(a.fallback) }
    : null;
};
export function profileAvatarView(value: unknown): PredefinedAvatar | PhotoAvatar | null {
  const photo = storedPhoto(value);
  if (!photo) return predefinedAvatar(value);
  const url = getCloudFrontDeliveryUrl(photo.objectKey);
  return url ? { type: 'photo', id: photo.id, url } : photo.fallback;
}
