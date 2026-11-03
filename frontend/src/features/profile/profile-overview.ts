import type { IconName } from '../../components/Icon';
import { isLinkedInProfileUrl } from './linkedin';
import type { ProfilePortfolioLink } from './profile.types';

export const safePortfolioHref = (value: string): string | null => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/** Stable stored order; equal sort orders retain API order. Never mutate the DTO. */
export const profilePortfolio = (links: readonly ProfilePortfolioLink[]) => {
  const ordered = [...links].sort((a, b) => a.sortOrder - b.sortOrder);
  const linkedIn = ordered.find(
    (link) => safePortfolioHref(link.url) !== null && isLinkedInProfileUrl(link.url),
  );
  return { linkedIn, remaining: ordered.filter((link) => link.id !== linkedIn?.id) };
};

export const profileInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase() || 'CC';

/** Presentation only: never fetch metadata or infer a person's professional details. */
export const portfolioLinkPresentation = (value: string): { icon: IconName; label: string } => {
  const safe = safePortfolioHref(value);
  if (!safe) return { icon: 'share', label: 'Update this link' };
  const host = new URL(safe).hostname.toLowerCase();
  if (isLinkedInProfileUrl(safe)) return { icon: 'linkedin', label: 'LinkedIn' };
  if (host === 'github.com' || host === 'www.github.com') return { icon: 'copy', label: 'GitHub' };
  return { icon: 'share', label: host.replace(/^www\./, '') };
};
export const profileDate = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? value
    : new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
};
