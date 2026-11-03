import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ModerationVisibility,
  ProjectStatus,
  ServiceStatus,
} from '../../generated/prisma/client.js';
import type { HomeSourceData } from './home.types.js';

const sourceLimit = 8;
const discoverLimit = 2;

export const homeRepository = {
  async read(userId: string): Promise<HomeSourceData> {
    const [
      user,
      marketplace,
      lostFound,
      teamUp,
      services,
      unreadMessages,
      discoverMarketplace,
      discoverLostFound,
      discoverTeamUp,
      discoverServices,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        select: { profile: { select: { fullName: true, profileCompletion: true } } },
        where: { id: userId },
      }),
      prisma.marketplace.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, title: true, updatedAt: true },
        take: sourceLimit,
        where: { sellerId: userId, status: ListingStatus.ACTIVE },
      }),
      prisma.lostFound.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { claims: true, id: true, status: true, title: true, updatedAt: true },
        take: sourceLimit,
        where: {
          reporterId: userId,
          status: {
            in: [LostFoundStatus.OPEN, LostFoundStatus.MATCHED, LostFoundStatus.CLAIM_PENDING],
          },
        },
      }),
      prisma.teamUp.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          applications: true,
          id: true,
          maxMembers: true,
          members: true,
          status: true,
          title: true,
          updatedAt: true,
        },
        take: sourceLimit,
        where: { ownerId: userId, status: { in: [ProjectStatus.OPEN, ProjectStatus.FULL] } },
      }),
      prisma.service.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { bookings: true, id: true, status: true, title: true, updatedAt: true },
        take: sourceLimit,
        where: { providerId: userId, status: ServiceStatus.ACTIVE },
      }),
      prisma.message.count({ where: { deletedAt: null, readAt: null, receiverId: userId } }),
      prisma.marketplace.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, title: true, updatedAt: true },
        take: discoverLimit,
        where: {
          moderationVisibility: ModerationVisibility.VISIBLE,
          sellerId: { not: userId },
          seller: { status: AccountStatus.ACTIVE },
          status: ListingStatus.ACTIVE,
        },
      }),
      prisma.lostFound.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, title: true, updatedAt: true },
        take: discoverLimit,
        where: {
          moderationVisibility: ModerationVisibility.VISIBLE,
          reporterId: { not: userId },
          reporter: { status: AccountStatus.ACTIVE },
          status: { in: [LostFoundStatus.OPEN, LostFoundStatus.MATCHED] },
        },
      }),
      prisma.teamUp.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, title: true, updatedAt: true },
        take: discoverLimit,
        where: {
          moderationVisibility: ModerationVisibility.VISIBLE,
          ownerId: { not: userId },
          owner: { status: AccountStatus.ACTIVE },
          status: ProjectStatus.OPEN,
        },
      }),
      prisma.service.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, title: true, updatedAt: true },
        take: discoverLimit,
        where: {
          moderationVisibility: ModerationVisibility.VISIBLE,
          providerId: { not: userId },
          provider: { status: AccountStatus.ACTIVE },
          status: ServiceStatus.ACTIVE,
        },
      }),
    ]);
    return {
      displayName: user.profile?.fullName ?? 'Student',
      lostFound,
      marketplace,
      profileCompletion: user.profile?.profileCompletion ?? 0,
      services,
      teamUp,
      unreadMessages,
      discover: [
        ...discoverMarketplace.map((item) => ({ ...item, kind: 'MARKETPLACE' as const })),
        ...discoverLostFound.map((item) => ({ ...item, kind: 'LOST_FOUND' as const })),
        ...discoverTeamUp.map((item) => ({ ...item, kind: 'TEAMUP' as const })),
        ...discoverServices.map((item) => ({ ...item, kind: 'SERVICE' as const })),
      ],
    };
  },
};

export interface HomeRepository {
  readonly read: (userId: string) => Promise<HomeSourceData>;
}
