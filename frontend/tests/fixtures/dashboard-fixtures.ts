import type { DashboardAnalytics } from '../../src/features/dashboard/dashboard-service';

/** Synthetic aggregate values only. Never persisted or used by the application. */
export const dashboardFixture: DashboardAnalytics = {
  metrics: [
    {
      id: 'marketplace',
      label: 'Active listings',
      value: 7,
      detail: '3 sold',
      path: '/marketplace',
    },
    {
      id: 'lost-found',
      label: 'Open reports',
      value: 2,
      detail: '5 resolved',
      path: '/lost-found',
    },
    {
      id: 'teamup',
      label: 'Projects owned',
      value: 4,
      detail: '1 completed',
      path: '/teamup/my-projects',
    },
    {
      id: 'services',
      label: 'Active services',
      value: 2,
      detail: '3 pending requests',
      path: '/services',
    },
  ],
  insights: {
    marketplace: { active: 7, sold: 3 },
    lostFound: { open: 2, resolved: 5 },
    teamUp: { owned: 4, completed: 1 },
    services: { pendingRequests: 3, completedRequests: 6 },
    communication: { unreadMessages: 8 },
  },
};
export const emptyDashboardFixture: DashboardAnalytics = {
  metrics: dashboardFixture.metrics.map((metric) => ({
    ...metric,
    value: 0,
    detail:
      metric.id === 'marketplace'
        ? '0 sold'
        : metric.id === 'lost-found'
          ? '0 resolved'
          : metric.id === 'teamup'
            ? '0 completed'
            : '0 pending requests',
  })),
  insights: {
    marketplace: { active: 0, sold: 0 },
    lostFound: { open: 0, resolved: 0 },
    teamUp: { owned: 0, completed: 0 },
    services: { pendingRequests: 0, completedRequests: 0 },
    communication: { unreadMessages: 0 },
  },
};
