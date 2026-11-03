import { prisma } from '../../database/prisma.js';
import { AccountStatus, ReportStatus, type Prisma } from '../../generated/prisma/client.js';
import type {
  ModerationDecision,
  ModerationQuery,
  ModerationTargetType,
  ReportSubmission,
} from './moderation.types.js';

const reportSelect = {
  createdAt: true,
  description: true,
  id: true,
  reason: true,
  reporter: { select: { id: true, profile: { select: { fullName: true } } } },
  resolutionNote: true,
  reviewedAt: true,
  reviewedBy: { select: { id: true, profile: { select: { fullName: true } } } },
  status: true,
  targetId: true,
  targetType: true,
  updatedAt: true,
} satisfies Prisma.ReportSelect;

const mapReport = (row: Prisma.ReportGetPayload<{ select: typeof reportSelect }>) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  reporter: {
    displayName: row.reporter.profile?.fullName ?? 'CampusConnect student',
    id: row.reporter.id,
  },
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  reviewer: row.reviewedBy
    ? { displayName: row.reviewedBy.profile?.fullName ?? 'Moderator', id: row.reviewedBy.id }
    : null,
  reviewedBy: undefined,
  updatedAt: row.updatedAt.toISOString(),
});

export const moderationRepository = {
  target: async (targetType: ModerationTargetType, targetId: string) => {
    if (targetType === 'MARKETPLACE') {
      const row = await prisma.marketplace.findFirst({
        where: { id: targetId, status: { not: 'ARCHIVED' } },
        select: { description: true, id: true, sellerId: true, status: true, title: true },
      });
      return row
        ? {
            ownerId: row.sellerId,
            preview: { description: row.description, status: row.status, title: row.title },
          }
        : null;
    }
    if (targetType === 'LOST_FOUND') {
      const row = await prisma.lostFound.findFirst({
        where: { id: targetId, status: { notIn: ['ARCHIVED', 'REMOVED'] } },
        select: { description: true, id: true, reporterId: true, status: true, title: true },
      });
      return row
        ? {
            ownerId: row.reporterId,
            preview: { description: row.description, status: row.status, title: row.title },
          }
        : null;
    }
    if (targetType === 'TEAMUP') {
      const row = await prisma.teamUp.findFirst({
        where: { id: targetId, status: { not: 'ARCHIVED' } },
        select: { description: true, id: true, ownerId: true, status: true, title: true },
      });
      return row
        ? {
            ownerId: row.ownerId,
            preview: { description: row.description, status: row.status, title: row.title },
          }
        : null;
    }
    if (targetType === 'SERVICE') {
      const row = await prisma.service.findFirst({
        where: { id: targetId, status: { not: 'ARCHIVED' } },
        select: { description: true, id: true, providerId: true, status: true, title: true },
      });
      return row
        ? {
            ownerId: row.providerId,
            preview: { description: row.description, status: row.status, title: row.title },
          }
        : null;
    }
    const row = await prisma.user.findFirst({
      where: { id: targetId, status: AccountStatus.ACTIVE },
      select: { id: true, profile: { select: { bio: true, fullName: true } } },
    });
    return row
      ? {
          ownerId: row.id,
          preview: {
            description: row.profile?.bio ?? null,
            status: 'ACTIVE',
            title: row.profile?.fullName ?? 'CampusConnect student',
          },
        }
      : null;
  },
  create: (reporterId: string, input: ReportSubmission) =>
    prisma.$transaction(
      async (transaction) => {
        const lockKey = `${reporterId}:${input.targetType}:${input.targetId}`;
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const existing = await transaction.report.findFirst({
          where: {
            reporterId,
            targetId: input.targetId,
            targetType: input.targetType,
            status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] },
          },
          select: { id: true },
        });
        if (existing) return { kind: 'duplicate' as const, reportId: existing.id };
        const since = new Date(Date.now() - 60 * 60 * 1000);
        const recent = await transaction.report.count({
          where: { reporterId, createdAt: { gte: since } },
        });
        if (recent >= 5) return { kind: 'rate-limited' as const };
        const report = await transaction.report.create({
          data: { ...input, reporterId },
          select: reportSelect,
        });
        return { kind: 'created' as const, report: mapReport(report) };
      },
      { isolationLevel: 'Serializable' },
    ),
  overview: async () => {
    const [open, underReview, resolved, dismissed, recent] = await Promise.all([
      prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      prisma.report.count({ where: { status: ReportStatus.UNDER_REVIEW } }),
      prisma.report.count({ where: { status: ReportStatus.RESOLVED } }),
      prisma.report.count({ where: { status: ReportStatus.DISMISSED } }),
      prisma.activity.findMany({
        where: { event: { startsWith: 'MODERATION_' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { createdAt: true, event: true, id: true, metadata: true, userId: true },
      }),
    ]);
    return {
      counts: { dismissed, open, resolved, underReview },
      recent: recent.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        id: item.id.toString(),
      })),
    };
  },
  list: async (query: ModerationQuery) => {
    const where: Prisma.ReportWhereInput = {
      ...(query.reason ? { reason: query.reason } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { resolutionNote: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.report.findMany({
        where,
        select: reportSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.report.count({ where }),
    ]);
    return { items: rows.map(mapReport), total };
  },
  detail: async (id: string) => {
    const report = await prisma.report.findUnique({ where: { id }, select: reportSelect });
    if (!report) return null;
    const [related, history] = await Promise.all([
      prisma.report.findMany({
        where: { targetId: report.targetId, targetType: report.targetType },
        select: reportSelect,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.activity.findMany({
        where: { entityType: 'REPORT', entityId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { createdAt: true, event: true, id: true, metadata: true, userId: true },
      }),
    ]);
    return {
      report: mapReport(report),
      related: related.map(mapReport),
      history: history.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        id: item.id.toString(),
      })),
    };
  },
  decide: async (actorId: string, reportId: string, decision: ModerationDecision) =>
    prisma.$transaction(
      async (transaction) => {
        const current = await transaction.report.findUnique({
          where: { id: reportId },
          select: { status: true, targetId: true, targetType: true },
        });
        if (!current) return 'not-found' as const;
        if (current.status === ReportStatus.RESOLVED || current.status === ReportStatus.DISMISSED)
          return 'finalized' as const;
        const updated = await transaction.report.updateMany({
          where: { id: reportId, status: current.status },
          data: {
            resolutionNote: decision.resolutionNote,
            reviewedAt: new Date(),
            reviewedById: actorId,
            status: decision.status,
          },
        });
        if (!updated.count) return 'conflict' as const;
        await transaction.activity.create({
          data: {
            entityId: reportId,
            entityType: 'REPORT',
            event: `MODERATION_${decision.status}`,
            metadata: {
              newStatus: decision.status,
              previousStatus: current.status,
              reason: decision.resolutionNote,
              targetId: current.targetId,
              targetType: current.targetType,
            },
            userId: actorId,
          },
        });
        const report = await transaction.report.findUniqueOrThrow({
          where: { id: reportId },
          select: reportSelect,
        });
        return { kind: 'updated' as const, report: mapReport(report) };
      },
      { isolationLevel: 'Serializable' },
    ),
  moderatorIds: () =>
    prisma.user.findMany({
      where: { role: { in: ['MODERATOR', 'ADMIN'] }, status: AccountStatus.ACTIVE },
      take: 100,
      select: { id: true },
    }),
};
