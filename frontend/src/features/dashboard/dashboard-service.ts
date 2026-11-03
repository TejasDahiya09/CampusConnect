import { apiRequest } from '../../services/api-client';
import type { IconName } from '../../components/Icon';
export interface DashboardMetric {
  readonly detail: string;
  readonly id: 'lost-found' | 'marketplace' | 'services' | 'teamup';
  readonly label: string;
  readonly path: string;
  readonly value: number;
}
export interface DashboardAnalytics {
  readonly metrics: readonly DashboardMetric[];
  readonly insights: {
    readonly communication: { readonly unreadMessages: number };
    readonly lostFound: { readonly open: number; readonly resolved: number };
    readonly marketplace: { readonly active: number; readonly sold: number };
    readonly services: { readonly completedRequests: number; readonly pendingRequests: number };
    readonly teamUp: { readonly completed: number; readonly owned: number };
  };
}
export const dashboardModules = [
  {
    id: 'marketplace',
    title: 'Marketplace',
    icon: 'store',
    path: '/marketplace/my-listings',
    description: 'Manage your listings and availability.',
  },
  {
    id: 'lost-found',
    title: 'Lost & Found',
    icon: 'search',
    path: '/lost-found/my-reports',
    description: 'Follow your reports, claims and resolutions.',
  },
  {
    id: 'teamup',
    title: 'TeamUp',
    icon: 'team',
    path: '/teamup/my-projects',
    description: 'Manage your projects, teams and applications.',
  },
  {
    id: 'services',
    title: 'Campus Services',
    icon: 'briefcase',
    path: '/services/saved',
    description: 'Manage offers and requests sent or received.',
  },
] as const satisfies readonly {
  id: DashboardMetric['id'];
  title: string;
  icon: IconName;
  path: string;
  description: string;
}[];

export const dashboardQuickActions = [
  {
    label: 'Sell an item',
    detail: 'Create a Marketplace listing',
    icon: 'store',
    path: '/marketplace/new',
  },
  {
    label: 'Report lost',
    detail: 'Tell campus what is missing',
    icon: 'search',
    path: '/lost-found/new?type=lost',
  },
  {
    label: 'Report found',
    detail: 'Help an item find its owner',
    icon: 'search',
    path: '/lost-found/new?type=found',
  },
  {
    label: 'Start a project',
    detail: 'Find your next teammates',
    icon: 'team',
    path: '/teamup/new',
  },
  {
    label: 'Offer a service',
    detail: 'Share your skills on campus',
    icon: 'briefcase',
    path: '/services/new',
  },
  {
    label: 'Open Messages',
    detail: 'Continue your conversations',
    icon: 'message',
    path: '/messages',
  },
] as const satisfies readonly { label: string; detail: string; icon: IconName; path: string }[];

export class DashboardDataError extends Error {}

/** One authoritative response: an incomplete payload is not a collection of zero counts. */
export function parseDashboardAnalytics(value: unknown): DashboardAnalytics {
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new DashboardDataError('Incomplete dashboard response.');
    return value as Record<string, unknown>;
  };
  const count = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      throw new DashboardDataError('Invalid dashboard count.');
    return value;
  };
  const input = record(value),
    source = record(input.insights);
  const group = (name: string) => record(source[name]);
  const insights: DashboardAnalytics['insights'] = {
    communication: { unreadMessages: count(group('communication').unreadMessages) },
    marketplace: {
      active: count(group('marketplace').active),
      sold: count(group('marketplace').sold),
    },
    lostFound: {
      open: count(group('lostFound').open),
      resolved: count(group('lostFound').resolved),
    },
    teamUp: { owned: count(group('teamUp').owned), completed: count(group('teamUp').completed) },
    services: {
      pendingRequests: count(group('services').pendingRequests),
      completedRequests: count(group('services').completedRequests),
    },
  };
  if (!Array.isArray(input.metrics) || input.metrics.length !== 4)
    throw new DashboardDataError('Incomplete dashboard metrics.');
  const metricRows = input.metrics;
  const metrics = dashboardModules.map((module) => {
    const matches = metricRows.filter((item: unknown) => record(item).id === module.id);
    if (matches.length !== 1) throw new DashboardDataError('Incomplete dashboard metrics.');
    const metric = record(matches[0]);
    if (
      typeof metric.label !== 'string' ||
      typeof metric.detail !== 'string' ||
      typeof metric.path !== 'string'
    )
      throw new DashboardDataError('Invalid dashboard metric.');
    return {
      id: module.id,
      label: metric.label,
      detail: metric.detail,
      path: metric.path,
      value: count(metric.value),
    };
  });
  return { metrics, insights };
}
export const dashboardApi = {
  get: async (signal?: AbortSignal) =>
    parseDashboardAnalytics(
      await apiRequest<unknown>('/api/dashboard', {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
      }),
    ),
};

export const dashboardAttention = (data: DashboardAnalytics) => [
  ...(data.insights.services.pendingRequests > 0
    ? [
        {
          id: 'service-requests',
          icon: 'briefcase' as const,
          count: data.insights.services.pendingRequests,
          label: 'Pending service requests received',
          description: 'Open your workspace, then choose Requests received to review.',
          path: '/services/saved',
        },
      ]
    : []),
  ...(data.insights.communication.unreadMessages > 0
    ? [
        {
          id: 'messages',
          icon: 'message' as const,
          count: data.insights.communication.unreadMessages,
          label: 'Unread messages',
          description: 'Catch up on your private campus conversations.',
          path: '/messages',
        },
      ]
    : []),
];
export const hasDashboardActivity = (data: DashboardAnalytics) =>
  data.metrics.some(({ value }) => value > 0) ||
  data.insights.communication.unreadMessages > 0 ||
  data.insights.marketplace.sold > 0 ||
  data.insights.lostFound.resolved > 0 ||
  data.insights.services.completedRequests > 0 ||
  data.insights.services.pendingRequests > 0 ||
  data.insights.teamUp.completed > 0;
