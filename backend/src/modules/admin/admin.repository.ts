import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ModerationVisibility,
  NotificationType,
  ProjectStatus,
  ServiceStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import type {
  AdminAccountDecision,
  AdminAuditQuery,
  AdminContentQuery,
  AdminEnforcementDecision,
  AdminEnforcementTargetType,
  AdminUserQuery,
} from './admin.types.js';

const page = <T>(items: readonly T[], total: number, query: { limit: number; page: number }) => ({
  items,
  pagination: {
    limit: query.limit,
    page: query.page,
    total,
    totalPages: Math.ceil(total / query.limit),
  },
});
const ownerSelect = {
  id: true,
  profile: { select: { fullName: true } },
} satisfies Prisma.UserSelect;
const owner = (value: { id: string; profile: { fullName: string } | null }) => ({
  displayName: value.profile?.fullName ?? 'CampusConnect student',
  id: value.id,
});
const isListingStatus = (value: unknown): value is ListingStatus =>
  Object.values(ListingStatus).some((candidate) => candidate === value);
const isLostFoundStatus = (value: unknown): value is LostFoundStatus =>
  Object.values(LostFoundStatus).some((candidate) => candidate === value);
const isProjectStatus = (value: unknown): value is ProjectStatus =>
  Object.values(ProjectStatus).some((candidate) => candidate === value);
const isServiceStatus = (value: unknown): value is ServiceStatus =>
  Object.values(ServiceStatus).some((candidate) => candidate === value);

export const adminRepository = {
  overview: async () => {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      marketplace,
      lostFound,
      teamUp,
      services,
      pendingReports,
      conversations,
      messages,
      recentActivity,
      registrations,
      contentTrends,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: AccountStatus.ACTIVE } }),
      prisma.user.count({ where: { status: AccountStatus.SUSPENDED } }),
      prisma.marketplace.count(),
      prisma.lostFound.count(),
      prisma.teamUp.count(),
      prisma.service.count(),
      prisma.report.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.activity.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          entityId: true,
          entityType: true,
          event: true,
          id: true,
          user: { select: { id: true, profile: { select: { fullName: true } } } },
        },
        take: 12,
      }),
      prisma.$queryRaw<readonly { count: number; day: Date }[]>`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
        FROM users WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1 ASC`,
      prisma.$queryRaw<readonly { count: number; day: Date; type: string }[]>`
        SELECT date_trunc('day', created_at) AS day, 'MARKETPLACE'::text AS type, COUNT(*)::int AS count FROM marketplace WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
        UNION ALL SELECT date_trunc('day', created_at), 'LOST_FOUND'::text, COUNT(*)::int FROM lost_found WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
        UNION ALL SELECT date_trunc('day', created_at), 'TEAMUP'::text, COUNT(*)::int FROM teamup WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
        UNION ALL SELECT date_trunc('day', created_at), 'SERVICE'::text, COUNT(*)::int FROM services WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY 1
        ORDER BY 1 ASC`,
    ]);
    return {
      contentTrends: contentTrends.map((item) => ({
        count: item.count,
        date: item.day.toISOString(),
        type: item.type,
      })),
      messaging: { conversations, messages },
      metrics: {
        activeUsers,
        lostFound,
        marketplace,
        pendingReports,
        services,
        suspendedUsers,
        teamUp,
        totalUsers,
      },
      recentActivity: recentActivity.map((item) => ({
        actor: item.user ? owner(item.user) : null,
        createdAt: item.createdAt.toISOString(),
        entityId: item.entityId,
        entityType: item.entityType,
        event: item.event,
        id: item.id.toString(),
      })),
      registrations: registrations.map((item) => ({
        count: item.count,
        date: item.day.toISOString(),
      })),
    };
  },
  users: async (query: AdminUserQuery) => {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { profile: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { profile: { department: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.user.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          createdAt: true,
          email: true,
          id: true,
          profile: {
            select: {
              department: true,
              fullName: true,
              moderatedAt: true,
              moderationReason: true,
              moderationVisibility: true,
            },
          },
          role: true,
          status: true,
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        where,
      }),
      prisma.user.count({ where }),
    ]);
    return page(
      rows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        department: row.profile?.department ?? null,
        displayName: row.profile?.fullName ?? 'CampusConnect student',
        email: row.email,
        id: row.id,
        profileModeratedAt: row.profile?.moderatedAt?.toISOString() ?? null,
        profileModerationReason: row.profile?.moderationReason ?? null,
        profileModerationVisibility: row.profile?.moderationVisibility ?? 'VISIBLE',
        role: row.role,
        status: row.status,
      })),
      total,
      query,
    );
  },
  userDetail: async (id: string) => {
    const row = await prisma.user.findUnique({
      select: {
        createdAt: true,
        email: true,
        emailVerifiedAt: true,
        id: true,
        lastSeenAt: true,
        profile: {
          select: { academicYear: true, department: true, fullName: true, university: true },
        },
        role: true,
        status: true,
        _count: {
          select: {
            activity: true,
            lostFoundItems: true,
            marketplaceItems: true,
            services: true,
            teamupProjects: true,
          },
        },
      },
      where: { id },
    });
    return row
      ? {
          academicYear: row.profile?.academicYear ?? null,
          contentCounts: row._count,
          createdAt: row.createdAt.toISOString(),
          department: row.profile?.department ?? null,
          displayName: row.profile?.fullName ?? 'CampusConnect student',
          email: row.email,
          emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
          id: row.id,
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
          role: row.role,
          status: row.status,
          university: row.profile?.university ?? null,
        }
      : null;
  },
  updateAccount: (actorId: string, targetId: string, decision: AdminAccountDecision) =>
    prisma.$transaction(
      async (transaction) => {
        const current = await transaction.user.findUnique({
          select: { role: true, status: true },
          where: { id: targetId },
        });
        if (!current) return 'not-found' as const;
        if (current.status === decision.status) return 'unchanged' as const;
        const updated = await transaction.user.update({
          data: { status: decision.status },
          select: { id: true, role: true, status: true },
          where: { id: targetId },
        });
        await transaction.activity.create({
          data: {
            entityId: targetId,
            entityType: 'USER',
            event:
              decision.status === AccountStatus.SUSPENDED
                ? 'ADMIN_USER_SUSPENDED'
                : 'ADMIN_USER_REACTIVATED',
            metadata: {
              newStatus: decision.status,
              previousStatus: current.status,
              reason: decision.reason,
            },
            userId: actorId,
          },
        });
        return { updated };
      },
      { isolationLevel: 'Serializable' },
    ),
  content: async (query: AdminContentQuery) => {
    const reportCounts = async (ids: readonly string[]) => {
      const counts = ids.length
        ? await prisma.report.groupBy({
            by: ['targetId'],
            where: { targetId: { in: [...ids] }, targetType: query.type },
            _count: { _all: true },
          })
        : [];
      return new Map(counts.map((item) => [item.targetId, item._count._all]));
    };
    const common = { skip: (query.page - 1) * query.limit, take: query.limit };
    if (query.type === 'MARKETPLACE') {
      const where: Prisma.MarketplaceWhereInput = {
        ...(query.visibility ? { moderationVisibility: query.visibility } : {}),
        ...(isListingStatus(query.status) ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { category: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.marketplace.findMany({
          ...common,
          orderBy: { createdAt: 'desc' },
          select: {
            category: true,
            createdAt: true,
            id: true,
            moderatedAt: true,
            moderationReason: true,
            moderationVisibility: true,
            price: true,
            seller: { select: ownerSelect },
            status: true,
            title: true,
          },
          where,
        }),
        prisma.marketplace.count({ where }),
      ]);
      const reports = await reportCounts(rows.map(({ id }) => id));
      return page(
        rows.map((row) => ({
          category: row.category,
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          metadata: `INR ${row.price.toString()}`,
          moderatedAt: row.moderatedAt?.toISOString() ?? null,
          moderationReason: row.moderationReason,
          moderationVisibility: row.moderationVisibility,
          owner: owner(row.seller),
          reportCount: reports.get(row.id) ?? 0,
          status: row.status,
          title: row.title,
          type: query.type,
        })),
        total,
        query,
      );
    }
    if (query.type === 'LOST_FOUND') {
      const where: Prisma.LostFoundWhereInput = {
        ...(query.visibility ? { moderationVisibility: query.visibility } : {}),
        ...(isLostFoundStatus(query.status) ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { category: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.lostFound.findMany({
          ...common,
          orderBy: { createdAt: 'desc' },
          select: {
            category: true,
            createdAt: true,
            id: true,
            moderatedAt: true,
            moderationReason: true,
            moderationVisibility: true,
            reporter: { select: ownerSelect },
            status: true,
            title: true,
            type: true,
          },
          where,
        }),
        prisma.lostFound.count({ where }),
      ]);
      const reports = await reportCounts(rows.map(({ id }) => id));
      return page(
        rows.map((row) => ({
          category: row.category,
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          metadata: row.type,
          moderatedAt: row.moderatedAt?.toISOString() ?? null,
          moderationReason: row.moderationReason,
          moderationVisibility: row.moderationVisibility,
          owner: owner(row.reporter),
          reportCount: reports.get(row.id) ?? 0,
          status: row.status,
          title: row.title,
          type: query.type,
        })),
        total,
        query,
      );
    }
    if (query.type === 'TEAMUP') {
      const where: Prisma.TeamUpWhereInput = {
        ...(query.visibility ? { moderationVisibility: query.visibility } : {}),
        ...(isProjectStatus(query.status) ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { category: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.teamUp.findMany({
          ...common,
          orderBy: { createdAt: 'desc' },
          select: {
            category: true,
            createdAt: true,
            id: true,
            members: true,
            moderatedAt: true,
            moderationReason: true,
            moderationVisibility: true,
            owner: { select: ownerSelect },
            requiredSkills: true,
            status: true,
            title: true,
          },
          where,
        }),
        prisma.teamUp.count({ where }),
      ]);
      const reports = await reportCounts(rows.map(({ id }) => id));
      return page(
        rows.map((row) => ({
          category: row.category,
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          metadata: `${row.requiredSkills.length} required skills`,
          moderatedAt: row.moderatedAt?.toISOString() ?? null,
          moderationReason: row.moderationReason,
          moderationVisibility: row.moderationVisibility,
          owner: owner(row.owner),
          reportCount: reports.get(row.id) ?? 0,
          status: row.status,
          title: row.title,
          type: query.type,
        })),
        total,
        query,
      );
    }
    const where: Prisma.ServiceWhereInput = {
      ...(query.visibility ? { moderationVisibility: query.visibility } : {}),
      ...(isServiceStatus(query.status) ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { category: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.service.findMany({
        ...common,
        orderBy: { createdAt: 'desc' },
        select: {
          category: true,
          createdAt: true,
          currency: true,
          id: true,
          moderatedAt: true,
          moderationReason: true,
          moderationVisibility: true,
          price: true,
          provider: { select: ownerSelect },
          status: true,
          title: true,
        },
        where,
      }),
      prisma.service.count({ where }),
    ]);
    const reports = await reportCounts(rows.map(({ id }) => id));
    return page(
      rows.map((row) => ({
        category: row.category,
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        metadata: row.price ? `${row.currency} ${row.price.toString()}` : 'Negotiable',
        moderatedAt: row.moderatedAt?.toISOString() ?? null,
        moderationReason: row.moderationReason,
        moderationVisibility: row.moderationVisibility,
        owner: owner(row.provider),
        reportCount: reports.get(row.id) ?? 0,
        status: row.status,
        title: row.title,
        type: query.type,
      })),
      total,
      query,
    );
  },
  audit: async (query: AdminAuditQuery) => {
    const where: Prisma.ActivityWhereInput = {
      ...(query.event ? { event: { contains: query.event, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { event: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.activity.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          entityId: true,
          entityType: true,
          event: true,
          id: true,
          metadata: true,
          user: { select: ownerSelect },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        where,
      }),
      prisma.activity.count({ where }),
    ]);
    return page(
      rows.map((row) => ({
        actor: row.user ? owner(row.user) : null,
        createdAt: row.createdAt.toISOString(),
        entityId: row.entityId,
        entityType: row.entityType,
        event: row.event,
        id: row.id.toString(),
        metadata: row.metadata,
      })),
      total,
      query,
    );
  },
  announcementCapability: () =>
    prisma.notification.count({ where: { type: NotificationType.ANNOUNCEMENT } }),
  enforceContent: (
    actorId: string,
    targetType: AdminEnforcementTargetType,
    targetId: string,
    decision: AdminEnforcementDecision,
  ) =>
    prisma.$transaction(
      async (transaction) => {
        const expected =
          decision.visibility === ModerationVisibility.HIDDEN
            ? ModerationVisibility.VISIBLE
            : ModerationVisibility.HIDDEN;
        const moderatedAt = new Date();
        const data = {
          moderatedAt,
          moderationReason: decision.reason,
          moderationVisibility: decision.visibility,
        };
        let target: { ownerId: string; status: string; title: string } | null = null;
        let changed = 0;
        if (targetType === 'MARKETPLACE') {
          const current = await transaction.marketplace.findUnique({
            select: { sellerId: true, status: true, title: true },
            where: { id: targetId },
          });
          if (current) {
            target = { ownerId: current.sellerId, status: current.status, title: current.title };
            changed = (
              await transaction.marketplace.updateMany({
                data,
                where: { id: targetId, moderationVisibility: expected },
              })
            ).count;
          }
        } else if (targetType === 'LOST_FOUND') {
          const current = await transaction.lostFound.findUnique({
            select: { reporterId: true, status: true, title: true },
            where: { id: targetId },
          });
          if (current) {
            target = { ownerId: current.reporterId, status: current.status, title: current.title };
            changed = (
              await transaction.lostFound.updateMany({
                data,
                where: { id: targetId, moderationVisibility: expected },
              })
            ).count;
          }
        } else if (targetType === 'TEAMUP') {
          const current = await transaction.teamUp.findUnique({
            select: { ownerId: true, status: true, title: true },
            where: { id: targetId },
          });
          if (current) {
            target = { ownerId: current.ownerId, status: current.status, title: current.title };
            changed = (
              await transaction.teamUp.updateMany({
                data,
                where: { id: targetId, moderationVisibility: expected },
              })
            ).count;
          }
        } else if (targetType === 'SERVICE') {
          const current = await transaction.service.findUnique({
            select: { providerId: true, status: true, title: true },
            where: { id: targetId },
          });
          if (current) {
            target = { ownerId: current.providerId, status: current.status, title: current.title };
            changed = (
              await transaction.service.updateMany({
                data,
                where: { id: targetId, moderationVisibility: expected },
              })
            ).count;
          }
        } else {
          const current = await transaction.profile.findUnique({
            select: { fullName: true, userId: true },
            where: { userId: targetId },
          });
          if (current) {
            target = { ownerId: current.userId, status: 'ACTIVE', title: current.fullName };
            changed = (
              await transaction.profile.updateMany({
                data,
                where: { userId: targetId, moderationVisibility: expected },
              })
            ).count;
          }
        }
        if (!target) return 'not-found' as const;
        if (!changed) return 'conflict' as const;
        await transaction.activity.create({
          data: {
            entityId: targetId,
            entityType: targetType,
            event:
              decision.visibility === ModerationVisibility.HIDDEN
                ? 'ADMIN_CONTENT_HIDDEN'
                : 'ADMIN_CONTENT_RESTORED',
            metadata: {
              businessStatus: target.status,
              newVisibility: decision.visibility,
              previousVisibility: expected,
              reason: decision.reason,
              relatedReportId: decision.relatedReportId ?? null,
            },
            userId: actorId,
          },
        });
        return {
          moderatedAt: moderatedAt.toISOString(),
          moderationReason: decision.reason,
          moderationVisibility: decision.visibility,
          ownerId: target.ownerId,
          title: target.title,
        };
      },
      { isolationLevel: 'Serializable' },
    ),
  enforcementHistory: async (targetType: AdminEnforcementTargetType, targetId: string) => {
    const rows = await prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        event: true,
        id: true,
        metadata: true,
        user: { select: ownerSelect },
      },
      take: 50,
      where: {
        entityId: targetId,
        entityType: targetType,
        event: { in: ['ADMIN_CONTENT_HIDDEN', 'ADMIN_CONTENT_RESTORED'] },
      },
    });
    return rows.map((row) => ({
      actor: row.user ? owner(row.user) : null,
      createdAt: row.createdAt.toISOString(),
      event: row.event,
      id: row.id.toString(),
      metadata: row.metadata,
    }));
  },
};
