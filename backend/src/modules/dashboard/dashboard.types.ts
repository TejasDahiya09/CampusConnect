export interface DashboardAnalyticsSource {
  readonly activeListings: number;
  readonly soldListings: number;
  readonly activeReports: number;
  readonly resolvedReports: number;
  readonly ownedProjects: number;
  readonly completedProjects: number;
  readonly activeServices: number;
  readonly serviceBookings: readonly unknown[];
  readonly unreadMessages: number;
}
