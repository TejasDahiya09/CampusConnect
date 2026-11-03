import { prisma } from '../../database/prisma.js';
import {
  ListingStatus,
  LostFoundStatus,
  ProjectStatus,
  ServiceStatus,
} from '../../generated/prisma/client.js';
import type { DashboardAnalyticsSource } from './dashboard.types.js';

export const dashboardRepository = {
  async read(userId: string): Promise<DashboardAnalyticsSource> {
    const [
      activeListings,
      soldListings,
      activeReports,
      resolvedReports,
      ownedProjects,
      completedProjects,
      activeServices,
      serviceRows,
      unreadMessages,
    ] = await Promise.all([
      prisma.marketplace.count({ where: { sellerId: userId, status: ListingStatus.ACTIVE } }),
      prisma.marketplace.count({ where: { sellerId: userId, status: ListingStatus.SOLD } }),
      prisma.lostFound.count({
        where: {
          reporterId: userId,
          status: {
            in: [LostFoundStatus.OPEN, LostFoundStatus.MATCHED, LostFoundStatus.CLAIM_PENDING],
          },
        },
      }),
      prisma.lostFound.count({ where: { reporterId: userId, status: LostFoundStatus.RESOLVED } }),
      prisma.teamUp.count({ where: { ownerId: userId, status: { not: ProjectStatus.ARCHIVED } } }),
      prisma.teamUp.count({ where: { ownerId: userId, status: ProjectStatus.COMPLETED } }),
      prisma.service.count({ where: { providerId: userId, status: ServiceStatus.ACTIVE } }),
      prisma.service.findMany({ select: { bookings: true }, where: { providerId: userId } }),
      prisma.message.count({ where: { deletedAt: null, readAt: null, receiverId: userId } }),
    ]);
    return {
      activeListings,
      soldListings,
      activeReports,
      resolvedReports,
      ownedProjects,
      completedProjects,
      activeServices,
      serviceBookings: serviceRows.map(({ bookings }) => bookings),
      unreadMessages,
    };
  },
};
export interface DashboardRepository {
  readonly read: (userId: string) => Promise<DashboardAnalyticsSource>;
}
