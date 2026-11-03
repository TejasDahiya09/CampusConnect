import { profileAvatarView } from '../profile/profile-avatar-value.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { getCloudFrontDeliveryUrl } from '../../services/storage/cloudfront-url.js';
import { isPredefinedAvatarId } from '../profile/profile-avatars.js';
import { searchRepository, type SearchRepository } from './search.repository.js';
import type { SearchQuery, SearchResponse, SearchResult } from './search.types.js';

const types = ['STUDENT', 'MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE'] as const;
type ResultType = (typeof types)[number];
const object = (value: Prisma.JsonValue): Prisma.JsonObject | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
const arrayLength = (value: Prisma.JsonValue) => (Array.isArray(value) ? value.length : 0);
const imageUrl = (value: Prisma.JsonValue): string | null => {
  if (!Array.isArray(value)) return null;
  const rows = value.flatMap((entry) => {
    const record = object(entry);
    const key = record && typeof record.key === 'string' ? record.key : null;
    const position = record && typeof record.position === 'number' ? record.position : 0;
    return key ? [{ key, position }] : [];
  });
  rows.sort((a, b) => a.position - b.position);
  return rows[0] ? getCloudFrontDeliveryUrl(rows[0].key) : null;
};
const avatarId = (value: Prisma.JsonValue | null): string | null => {
  if (typeof value === 'string' && isPredefinedAvatarId(value)) return value;
  const record = value === null ? null : object(value);
  return record && isPredefinedAvatarId(record.id) ? record.id : null;
};
const score = (result: SearchResult, query: string) => {
  const needle = query.toLocaleLowerCase();
  const title = result.title.toLocaleLowerCase();
  if (title === needle) return 500;
  if (title.startsWith(needle)) return 400;
  if (title.includes(needle)) return 300;
  const metadata: string[] = [];
  for (const value of Object.values(result.metadata)) {
    if (typeof value === 'string') metadata.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === 'string') metadata.push(entry);
    }
  }
  if (metadata.some((value) => value.toLocaleLowerCase() === needle)) return 200;
  if (metadata.some((value) => value.toLocaleLowerCase().includes(needle))) return 150;
  return result.description?.toLocaleLowerCase().includes(needle) ? 100 : 0;
};
const ranked = (items: readonly SearchResult[], query: string) =>
  [...items].sort(
    (a, b) =>
      score(b, query) - score(a, query) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );

export const createSearchService = (repository: SearchRepository = searchRepository) => ({
  async search(input: SearchQuery): Promise<SearchResponse> {
    const candidateLimit = Math.min(200, input.page * input.limit + 50);
    const enabled = (type: ResultType) => input.type === 'ALL' || input.type === type;
    const [students, marketplace, lostFound, teamUp, services] = await Promise.all([
      enabled('STUDENT') ? repository.students(input.query, candidateLimit) : [],
      enabled('MARKETPLACE') ? repository.marketplace(input.query, candidateLimit) : [],
      enabled('LOST_FOUND') ? repository.lostFound(input.query, candidateLimit) : [],
      enabled('TEAMUP') ? repository.teamUp(input.query, candidateLimit) : [],
      enabled('SERVICE') ? repository.services(input.query, candidateLimit) : [],
    ]);
    const groups: Record<ResultType, SearchResult[]> = {
      STUDENT: students.map((row) => ({
        description: row.bio,
        id: row.userId,
        image: (() => {
          const avatar = profileAvatarView(row.avatar);
          return avatar?.type === 'photo' ? avatar.url : null;
        })(),
        metadata: {
          avatarId: avatarId(row.avatar),
          department: row.department,
          interests: row.interests,
          skills: row.skills,
        },
        navigationTarget: `/profile/${row.userId}`,
        subtitle: row.department,
        title: row.fullName,
        type: 'STUDENT',
      })),
      MARKETPLACE: marketplace.map((row) => ({
        description: row.description,
        id: row.id,
        image: imageUrl(row.images),
        metadata: { category: row.category, location: row.location, price: row.price.toString() },
        navigationTarget: `/marketplace/${row.id}`,
        subtitle: `${row.currency ?? 'INR'} ${row.price.toString()}`,
        title: row.title,
        type: 'MARKETPLACE',
      })),
      LOST_FOUND: lostFound.map((row) => ({
        description: row.description,
        id: row.id,
        image: imageUrl(row.images),
        metadata: { category: row.category, location: row.location, status: row.status },
        navigationTarget: `/lost-found/${row.id}`,
        subtitle: `${row.type}${row.location ? ` · ${row.location}` : ''}`,
        title: row.title,
        type: 'LOST_FOUND',
      })),
      TEAMUP: teamUp.map((row) => ({
        description: row.description,
        id: row.id,
        image: null,
        metadata: {
          category: row.category,
          currentMembers: arrayLength(row.members),
          maxMembers: row.maxMembers,
          skills: row.requiredSkills,
        },
        navigationTarget: `/teamup/${row.id}`,
        subtitle: row.category,
        title: row.title,
        type: 'TEAMUP',
      })),
      SERVICE: services.map((row) => ({
        description: row.description,
        id: row.id,
        image: imageUrl(row.images),
        metadata: {
          category: row.category,
          location: row.location,
          price: row.price?.toString() ?? null,
          provider: row.provider.profile?.fullName ?? 'Campus student',
          skills: row.skills,
        },
        navigationTarget: `/services/${row.id}`,
        subtitle: row.provider.profile?.fullName ?? 'Campus student',
        title: row.title,
        type: 'SERVICE',
      })),
    };
    for (const type of types) groups[type] = ranked(groups[type], input.query);
    const totals = Object.fromEntries(types.map((type) => [type, groups[type].length])) as Record<
      ResultType,
      number
    >;
    const start = (input.page - 1) * input.limit;
    const items =
      input.type === 'ALL'
        ? types.flatMap((type) => groups[type].slice(start, start + input.limit))
        : groups[input.type].slice(start, start + input.limit);
    const total =
      input.type === 'ALL'
        ? Object.values(totals).reduce((sum, value) => sum + value, 0)
        : totals[input.type];
    const pageBasis = input.type === 'ALL' ? Math.max(...Object.values(totals), 0) : total;
    return {
      items,
      limit: input.limit,
      page: input.page,
      total,
      totalPages: Math.ceil(pageBasis / input.limit),
      totals,
    };
  },
});

export const searchService = createSearchService();
