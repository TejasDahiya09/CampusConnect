import { homeRepository, type HomeRepository } from './home.repository.js';
import type { HomeAttentionItem, HomeItemKind, HomeSourceData } from './home.types.js';

const records = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
    : [];
const statusCount = (value: unknown, status: string) =>
  records(value).filter((entry) => entry.status === status).length;
const memberCount = (value: unknown) => records(value).length + 1;
const path = (kind: Exclude<HomeItemKind, 'MESSAGING'>, id: string) =>
  ({
    LOST_FOUND: `/lost-found/${id}`,
    MARKETPLACE: `/marketplace/${id}`,
    SERVICE: `/services/${id}`,
    TEAMUP: `/teamup/${id}`,
  })[kind];
const label = (kind: Exclude<HomeItemKind, 'MESSAGING'>) =>
  ({
    LOST_FOUND: 'Lost & Found',
    MARKETPLACE: 'Marketplace',
    SERVICE: 'Services',
    TEAMUP: 'TeamUp',
  })[kind];

export const buildHome = (source: HomeSourceData) => {
  const attention: HomeAttentionItem[] = [];
  for (const item of source.lostFound) {
    const count = statusCount(item.claims, 'PENDING');
    if (count)
      attention.push({
        actionLabel: 'Review',
        description: item.title,
        entityKey: `LOST_FOUND:${item.id}`,
        id: `lost-found-claim-${item.id}`,
        kind: 'LOST_FOUND',
        path: `/lost-found/${item.id}`,
        priority: 1,
        title: `${count} ${count === 1 ? 'claim needs' : 'claims need'} your review`,
      });
  }
  for (const item of source.teamUp) {
    const count = statusCount(item.applications, 'PENDING');
    if (count)
      attention.push({
        actionLabel: 'Review',
        description: item.title,
        entityKey: `TEAMUP:${item.id}`,
        id: `teamup-application-${item.id}`,
        kind: 'TEAMUP',
        path: `/teamup/${item.id}`,
        priority: 2,
        title: `${count} ${count === 1 ? 'student applied' : 'students applied'} to your project`,
      });
  }
  for (const item of source.services) {
    const count = statusCount(item.bookings, 'PENDING');
    if (count)
      attention.push({
        actionLabel: 'Review',
        description: item.title,
        entityKey: `SERVICE:${item.id}`,
        id: `service-request-${item.id}`,
        kind: 'SERVICE',
        path: `/services/${item.id}`,
        priority: 2,
        title: `${count} new service ${count === 1 ? 'request' : 'requests'}`,
      });
  }
  if (source.unreadMessages)
    attention.push({
      actionLabel: 'Open messages',
      description: 'Continue your conversations',
      id: 'unread-messages',
      kind: 'MESSAGING',
      path: '/messages',
      priority: 3,
      title: `${source.unreadMessages} unread ${source.unreadMessages === 1 ? 'message' : 'messages'}`,
    });
  const attentionItems = attention
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, 4);
  const used = new Set(attentionItems.flatMap(({ entityKey }) => (entityKey ? [entityKey] : [])));
  const continuation = [
    ...source.marketplace.map((item) => ({
      ...item,
      kind: 'MARKETPLACE' as const,
      meta: 'Marketplace · Active listing',
    })),
    ...source.lostFound.map((item) => ({
      ...item,
      kind: 'LOST_FOUND' as const,
      meta: `Lost & Found · ${item.status.replaceAll('_', ' ').toLocaleLowerCase()}`,
    })),
    ...source.teamUp.map((item) => ({
      ...item,
      kind: 'TEAMUP' as const,
      meta: `TeamUp · ${memberCount(item.members)}/${item.maxMembers} members`,
    })),
    ...source.services.map((item) => ({
      ...item,
      kind: 'SERVICE' as const,
      meta: 'Services · Active',
    })),
  ]
    .filter((item) => !used.has(`${item.kind}:${item.id}`))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((item) => ({
      id: `${item.kind.toLocaleLowerCase()}-${item.id}`,
      kind: item.kind,
      meta: item.meta,
      path: path(item.kind, item.id),
      title: item.title,
      updatedAt: item.updatedAt.toISOString(),
    }));
  const discoverItems = [...source.discover]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, 4)
    .map((item) => ({
      id: `discover-${item.kind.toLocaleLowerCase()}-${item.id}`,
      kind: item.kind,
      meta: label(item.kind),
      path: path(item.kind, item.id),
      title: item.title,
    }));
  return {
    attentionItems: attentionItems.map(
      ({ priority: _priority, entityKey: _entityKey, ...item }) => item,
    ),
    continueItems: continuation,
    discoverItems,
    greetingIdentity: { displayName: source.displayName },
    profileCompletion: source.profileCompletion,
  };
};

export const createHomeService = (repository: HomeRepository = homeRepository) => ({
  get: async (userId: string) => buildHome(await repository.read(userId)),
});
export const homeService = createHomeService();
