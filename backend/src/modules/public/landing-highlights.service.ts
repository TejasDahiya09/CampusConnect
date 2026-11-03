import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  landingHighlightsRepository,
  type LandingHighlightsRepository,
} from './landing-highlights.repository.js';
import { isSafeLandingTitle, safeLandingMetadata } from './landing-highlights.privacy.js';
import type {
  LandingHighlight,
  LandingHighlightCandidates,
  LostFoundLandingHighlight,
  MarketplaceLandingHighlight,
  ServiceLandingHighlight,
  TeamUpLandingHighlight,
} from './landing-highlights.types.js';

const rotationWindowMs = 15 * 60 * 1000;
const maxPerModule = 2;
const maxResponseBytes = 32 * 1024;

const rank = (bucket: number, kind: string, id: string): string =>
  createHash('sha256').update(`${bucket}:${kind}:${id}`).digest('hex');

const rotate = <T extends { readonly id: string }>(
  values: readonly T[],
  bucket: number,
  kind: string,
): readonly T[] =>
  [...values].sort((left, right) => {
    const byRank = rank(bucket, kind, left.id).localeCompare(rank(bucket, kind, right.id));
    return byRank === 0 ? left.id.localeCompare(right.id) : byRank;
  });

const marketplaceHighlight = (
  row: LandingHighlightCandidates['marketplace'][number],
): MarketplaceLandingHighlight => ({
  createdAt: row.createdAt.toISOString(),
  id: row.id,
  kind: 'MARKETPLACE',
  metadata: {
    category: row.category,
    condition: row.condition,
    currency: row.currency.trim(),
    price: row.price.toFixed(2),
  },
  route: `/marketplace/${row.id}`,
  summary: `${row.category} in ${row.condition.toLowerCase()} condition.`,
  title: row.title.trim(),
});

const lostFoundHighlight = (
  row: LandingHighlightCandidates['lostFound'][number],
): LostFoundLandingHighlight => {
  const category = safeLandingMetadata(row.category, true);
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: 'LOST_FOUND',
    metadata: { category, reportType: row.type, status: 'OPEN' },
    route: `/lost-found/${row.id}`,
    summary: `${row.type === 'LOST' ? 'Lost' : 'Found'} ${category ?? 'item'} report currently open.`,
    title: row.title.trim(),
  };
};

const teamUpHighlight = (
  row: LandingHighlightCandidates['teamUp'][number],
): TeamUpLandingHighlight => {
  const category = safeLandingMetadata(row.category);
  const skills = row.requiredSkills
    .map((skill) => safeLandingMetadata(skill))
    .filter((skill): skill is string => skill !== null)
    .slice(0, 4);
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: 'TEAMUP',
    metadata: { category, requiredSkills: skills, status: 'OPEN' },
    route: `/teamup/${row.id}`,
    summary:
      skills.length === 0
        ? 'Open student collaboration project.'
        : `Open student project seeking ${skills.join(', ')}.`,
    title: row.title.trim(),
  };
};

const pricing = (
  price: Prisma.Decimal | null,
): ServiceLandingHighlight['metadata']['pricingType'] =>
  price === null ? 'NEGOTIABLE' : price.isZero() ? 'FREE' : 'FIXED';

const serviceHighlight = (
  row: LandingHighlightCandidates['services'][number],
): ServiceLandingHighlight => {
  const pricingType = pricing(row.price);
  const category = safeLandingMetadata(row.category);
  const skills = row.skills
    .map((skill) => safeLandingMetadata(skill))
    .filter((skill): skill is string => skill !== null)
    .slice(0, 4);
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: 'SERVICE',
    metadata: {
      category,
      currency: row.currency.trim(),
      price: row.price?.toFixed(2) ?? null,
      pricingType,
      skills,
    },
    route: `/services/${row.id}`,
    summary: `${category ?? 'Student'} service with ${pricingType.toLowerCase()} pricing.`,
    title: row.title.trim(),
  };
};

const boundedResponse = (highlights: LandingHighlight[]): LandingHighlight[] => {
  while (
    highlights.length > 0 &&
    Buffer.byteLength(JSON.stringify({ highlights }), 'utf8') > maxResponseBytes
  )
    highlights.pop();
  return highlights;
};

export const createLandingHighlightsService = (
  repository: Pick<LandingHighlightsRepository, 'findCandidates'> = landingHighlightsRepository,
  now: () => number = Date.now,
) => ({
  list: async (limit: number): Promise<readonly LandingHighlight[]> => {
    const candidates = await repository.findCandidates();
    const bucket = Math.floor(now() / rotationWindowMs);
    const groups: readonly (readonly LandingHighlight[])[] = [
      rotate(
        candidates.marketplace.filter(({ title }) => isSafeLandingTitle(title)),
        bucket,
        'MARKETPLACE',
      )
        .slice(0, maxPerModule)
        .map(marketplaceHighlight),
      rotate(
        candidates.lostFound.filter(({ title }) => isSafeLandingTitle(title, true)),
        bucket,
        'LOST_FOUND',
      )
        .slice(0, maxPerModule)
        .map(lostFoundHighlight),
      rotate(
        candidates.teamUp.filter(({ title }) => isSafeLandingTitle(title)),
        bucket,
        'TEAMUP',
      )
        .slice(0, maxPerModule)
        .map(teamUpHighlight),
      rotate(
        candidates.services.filter(({ title }) => isSafeLandingTitle(title)),
        bucket,
        'SERVICE',
      )
        .slice(0, maxPerModule)
        .map(serviceHighlight),
    ];
    const orderedGroups = [
      ...groups.slice(bucket % groups.length),
      ...groups.slice(0, bucket % groups.length),
    ];
    const highlights: LandingHighlight[] = [];
    for (let position = 0; position < maxPerModule && highlights.length < limit; position += 1)
      for (const group of orderedGroups) {
        const highlight = group[position];
        if (highlight !== undefined) highlights.push(highlight);
        if (highlights.length === limit) break;
      }
    return boundedResponse(highlights);
  },
});

export const landingHighlightsService = createLandingHighlightsService();
export type LandingHighlightsService = typeof landingHighlightsService;
