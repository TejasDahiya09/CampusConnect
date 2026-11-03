import type { LandingHighlight, LandingHighlightKind } from './landing-highlights';

export type ContentVisualKind =
  | 'bag'
  | 'book'
  | 'calculator'
  | 'device'
  | 'cycle'
  | 'furniture'
  | 'keys'
  | 'wallet'
  | 'identity'
  | 'project'
  | 'design'
  | 'tutoring'
  | 'service'
  | 'item';

export const highlightLabels: Readonly<Record<LandingHighlightKind, string>> = {
  MARKETPLACE: 'Marketplace',
  LOST_FOUND: 'Lost & Found',
  TEAMUP: 'TeamUp',
  SERVICE: 'Services',
};

/** Only presentation of the already validated public DTO; no additional records or fields. */
export function highlightPresentation(item: LandingHighlight) {
  const category = item.metadata.category ?? highlightLabels[item.kind];
  const tags =
    item.kind === 'MARKETPLACE'
      ? [category, item.metadata.condition.replaceAll('_', ' ')]
      : item.kind === 'LOST_FOUND'
        ? [item.metadata.reportType, category, 'Open report']
        : item.kind === 'TEAMUP'
          ? ['Open project', ...item.metadata.requiredSkills]
          : [category, ...item.metadata.skills];
  const price =
    item.kind === 'MARKETPLACE' || item.kind === 'SERVICE'
      ? item.kind === 'SERVICE' && item.metadata.pricingType === 'FREE'
        ? 'Free'
        : item.kind === 'SERVICE' && item.metadata.pricingType === 'NEGOTIABLE'
          ? 'Negotiable'
          : item.metadata.price === null
            ? 'Fixed price'
            : `${item.metadata.currency} ${item.metadata.price}`
      : null;
  return {
    category,
    label: highlightLabels[item.kind],
    tags,
    price,
    visual: contentVisual(item.kind, item.title, category),
  };
}

export function contentVisual(
  kind: LandingHighlightKind,
  title: string,
  category: string,
): ContentVisualKind {
  const subject = `${title} ${category}`.toLowerCase();
  if (kind === 'TEAMUP') return 'project';
  if (kind === 'SERVICE') {
    if (/design|creative|presentation|art\b/.test(subject)) return 'design';
    if (/tutor|academic|teaching|exam/.test(subject)) return 'tutoring';
    if (/technical|technology|code|programming|web/.test(subject)) return 'device';
    return 'service';
  }
  if (/calculat/.test(subject)) return 'calculator';
  if (/textbook|notebook|register|book|study material/.test(subject)) return 'book';
  if (/backpack|bag\b/.test(subject)) return 'bag';
  if (/\bkeys?\b/.test(subject)) return 'keys';
  if (/wallet|purse/.test(subject)) return 'wallet';
  if (/\bid card\b|identity card/.test(subject)) return 'identity';
  if (/bicycle|cycle/.test(subject)) return 'cycle';
  if (/furniture|chair|desk|table/.test(subject)) return 'furniture';
  if (/electronic|laptop|phone|earbud|earphone|device|headphone/.test(subject)) return 'device';
  return 'item';
}

/** Preserve the feed order and keep the visit-local selection bounded and duplicate-free. */
export function spotlightSelection(
  items: readonly LandingHighlight[],
): readonly LandingHighlight[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
