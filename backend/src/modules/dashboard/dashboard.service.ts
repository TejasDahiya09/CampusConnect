import { dashboardRepository, type DashboardRepository } from './dashboard.repository.js';
import type { DashboardAnalyticsSource } from './dashboard.types.js';

const records = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
    : [];

export const buildDashboardAnalytics = (source: DashboardAnalyticsSource) => {
  const requests = source.serviceBookings.flatMap(records);
  const pendingRequests = requests.filter(({ status }) => status === 'PENDING').length;
  const completedRequests = requests.filter(({ status }) => status === 'COMPLETED').length;
  return {
    metrics: [
      {
        detail: `${source.soldListings} sold`,
        id: 'marketplace',
        label: 'Active listings',
        path: '/marketplace',
        value: source.activeListings,
      },
      {
        detail: `${source.resolvedReports} resolved`,
        id: 'lost-found',
        label: 'Open reports',
        path: '/lost-found',
        value: source.activeReports,
      },
      {
        detail: `${source.completedProjects} completed`,
        id: 'teamup',
        label: 'Projects owned',
        path: '/teamup/my-projects',
        value: source.ownedProjects,
      },
      {
        detail: `${pendingRequests} pending requests`,
        id: 'services',
        label: 'Active services',
        path: '/services',
        value: source.activeServices,
      },
    ],
    insights: {
      communication: { unreadMessages: source.unreadMessages },
      lostFound: { open: source.activeReports, resolved: source.resolvedReports },
      marketplace: { active: source.activeListings, sold: source.soldListings },
      services: { completedRequests, pendingRequests },
      teamUp: { completed: source.completedProjects, owned: source.ownedProjects },
    },
  };
};
export const createDashboardService = (repository: DashboardRepository = dashboardRepository) => ({
  get: async (userId: string) => buildDashboardAnalytics(await repository.read(userId)),
});
export const dashboardService = createDashboardService();
