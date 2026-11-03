import { profileAvatarView } from '../profile/profile-avatar-value.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ClaimStatus,
  LostFoundStatus,
  ModerationVisibility,
  Prisma,
  type LostFoundStatus as LostFoundStatusValue,
} from '../../generated/prisma/client.js';
import {
  claimsToJson,
  parseLostFoundClaims,
  parseLostFoundImages,
  parseStringArray,
} from './lost-found-json.js';
import type {
  LostFoundBookmarkQuery,
  LostFoundClaim,
  LostFoundCreateInput,
  LostFoundQuery,
  LostFoundReportView,
  LostFoundSort,
  LostFoundUpdateInput,
} from './lost-found.types.js';

const publicStatuses: LostFoundStatusValue[] = [
  LostFoundStatus.OPEN,
  LostFoundStatus.MATCHED,
  LostFoundStatus.CLAIM_PENDING,
  LostFoundStatus.RESOLVED,
];

export const aiMatchCandidateStatuses: LostFoundStatusValue[] = [
  LostFoundStatus.OPEN,
  LostFoundStatus.MATCHED,
  LostFoundStatus.CLAIM_PENDING,
];

export const lostFoundSelect = {
  bookmarks: true,
  category: true,
  claims: true,
  createdAt: true,
  description: true,
  featuredOnLanding: true,
  id: true,
  images: true,
  incidentDate: true,
  location: true,
  matches: true,
  reporter: {
    select: {
      id: true,
      profile: {
        select: { avatar: true, department: true, fullName: true, moderationVisibility: true },
      },
    },
  },
  reporterId: true,
  resolvedAt: true,
  status: true,
  title: true,
  type: true,
  updatedAt: true,
} satisfies Prisma.LostFoundSelect;

export type LostFoundRow = Prisma.LostFoundGetPayload<{ select: typeof lostFoundSelect }>;

export const mapLostFoundReport = (row: LostFoundRow, viewerId?: string): LostFoundReportView => {
  const bookmarks = parseStringArray(row.bookmarks);
  const claims = parseLostFoundClaims(row.claims);
  return {
    bookmarkCount: bookmarks.length,
    category: row.category,
    claimCount: claims.length,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    ...(viewerId === row.reporterId ? { featuredOnLanding: row.featuredOnLanding } : {}),
    id: row.id,
    images: parseLostFoundImages(row.images),
    incidentDate: row.incidentDate?.toISOString().slice(0, 10) ?? null,
    isBookmarked: viewerId !== undefined && bookmarks.includes(viewerId),
    location: row.location,
    matchCount: Array.isArray(row.matches) ? row.matches.length : 0,
    reporter: {
      avatar:
        row.reporter.profile?.moderationVisibility === 'VISIBLE'
          ? profileAvatarView(row.reporter.profile.avatar)
          : null,
      department: row.reporter.profile?.department ?? null,
      displayName: row.reporter.profile?.fullName ?? 'CampusConnect student',
      id: row.reporter.id,
    },
    reporterId: row.reporterId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    status: row.status,
    title: row.title,
    type: row.type,
    updatedAt: row.updatedAt.toISOString(),
  };
};

const orderBy = (sort: LostFoundSort): Prisma.LostFoundOrderByWithRelationInput[] => {
  switch (sort) {
    case 'incident_newest':
      return [{ incidentDate: 'desc' }, { id: 'desc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
  }
};

export const buildLostFoundWhere = (query: LostFoundQuery): Prisma.LostFoundWhereInput => ({
  moderationVisibility: ModerationVisibility.VISIBLE,
  ...(query.category === undefined
    ? {}
    : { category: { equals: query.category, mode: 'insensitive' } }),
  ...(query.dateFrom === undefined && query.dateTo === undefined
    ? {}
    : {
        incidentDate: {
          ...(query.dateFrom === undefined ? {} : { gte: query.dateFrom }),
          ...(query.dateTo === undefined ? {} : { lte: query.dateTo }),
        },
      }),
  ...(query.keyword === undefined
    ? {}
    : {
        OR: [
          { title: { contains: query.keyword, mode: 'insensitive' } },
          { description: { contains: query.keyword, mode: 'insensitive' } },
          { category: { contains: query.keyword, mode: 'insensitive' } },
          { location: { contains: query.keyword, mode: 'insensitive' } },
        ],
      }),
  ...(query.location === undefined
    ? {}
    : { location: { contains: query.location, mode: 'insensitive' } }),
  reporter: { status: AccountStatus.ACTIVE },
  status: query.status ?? { in: publicStatuses },
  ...(query.type === undefined ? {} : { type: query.type }),
});

export type ClaimMutationResult =
  | { readonly kind: 'claim'; readonly claim: LostFoundClaim }
  | { readonly kind: 'conflict' | 'forbidden' | 'not-found' };

export interface LostFoundRepository {
  addBookmark(userId: string, reportId: string): Promise<boolean | null>;
  cancelClaim(userId: string, reportId: string, claimId: string): Promise<ClaimMutationResult>;
  create(reporterId: string, input: LostFoundCreateInput): Promise<LostFoundReportView>;
  findById(id: string, viewerId?: string): Promise<LostFoundReportView | null>;
  list(
    query: LostFoundQuery,
    viewerId?: string,
  ): Promise<{ readonly items: readonly LostFoundReportView[]; readonly total: number }>;
  listBookmarks(
    userId: string,
    query: LostFoundBookmarkQuery,
  ): Promise<{ readonly items: readonly LostFoundReportView[]; readonly total: number }>;
  listClaims(reportId: string): Promise<readonly LostFoundClaim[] | null>;
  listMyReports(userId: string): Promise<readonly LostFoundReportView[]>;
  listMatchCandidates(
    sourceId: string,
    type: 'FOUND' | 'LOST',
    limit: number,
    viewerId: string,
  ): Promise<readonly LostFoundReportView[]>;
  removeBookmark(userId: string, reportId: string): Promise<boolean>;
  reviewClaim(
    reviewerId: string,
    canModerate: boolean,
    reportId: string,
    claimId: string,
    status: ClaimStatus,
  ): Promise<ClaimMutationResult>;
  submitClaim(userId: string, reportId: string, message: string): Promise<ClaimMutationResult>;
  transitionOwned(
    id: string,
    reporterId: string,
    status: LostFoundStatusValue,
    resolvedAt: Date | null,
  ): Promise<LostFoundReportView | null>;
  updateOwned(
    id: string,
    reporterId: string,
    input: LostFoundUpdateInput,
  ): Promise<LostFoundReportView | null>;
}

const bookmarkableWhere = {
  moderationVisibility: ModerationVisibility.VISIBLE,
  reporter: { status: AccountStatus.ACTIVE },
  status: { in: publicStatuses },
} satisfies Prisma.LostFoundWhereInput;

export const lostFoundRepository: LostFoundRepository = {
  addBookmark: (userId, reportId) =>
    prisma.$transaction(
      async (transaction) => {
        const report = await transaction.lostFound.findFirst({
          select: { bookmarks: true },
          where: { ...bookmarkableWhere, id: reportId },
        });
        if (report === null) return null;
        const bookmarks = parseStringArray(report.bookmarks);
        if (!bookmarks.includes(userId))
          await transaction.lostFound.update({
            data: { bookmarks: [...bookmarks, userId] },
            where: { id: reportId },
          });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  cancelClaim: (userId, reportId, claimId) =>
    prisma.$transaction(
      async (transaction): Promise<ClaimMutationResult> => {
        const report = await transaction.lostFound.findUnique({
          select: { claims: true },
          where: { id: reportId },
        });
        if (report === null) return { kind: 'not-found' };
        const claims = parseLostFoundClaims(report.claims);
        const index = claims.findIndex((claim) => claim.id === claimId);
        const claim = claims[index];
        if (claim === undefined) return { kind: 'not-found' };
        if (claim.claimantId !== userId) return { kind: 'forbidden' };
        if (claim.status !== ClaimStatus.PENDING) return { kind: 'conflict' };
        const updated: LostFoundClaim = { ...claim, status: ClaimStatus.CANCELLED };
        claims[index] = updated;
        await transaction.lostFound.update({
          data: { claims: claimsToJson(claims) },
          where: { id: reportId },
        });
        return { claim: updated, kind: 'claim' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  create: async (reporterId, input) => {
    const row = await prisma.lostFound.create({
      data: {
        ...input,
        featuredOnLanding: input.featuredOnLanding ?? false,
        reporterId,
        status: LostFoundStatus.OPEN,
      },
      select: lostFoundSelect,
    });
    return mapLostFoundReport(row, reporterId);
  },

  findById: async (id, viewerId) => {
    const row = await prisma.lostFound.findFirst({
      select: lostFoundSelect,
      where: {
        id,
        moderationVisibility: ModerationVisibility.VISIBLE,
        reporter: { status: AccountStatus.ACTIVE },
      },
    });
    return row === null ? null : mapLostFoundReport(row, viewerId);
  },

  list: async (query, viewerId) => {
    const where = buildLostFoundWhere(query);
    const [rows, total] = await Promise.all([
      prisma.lostFound.findMany({
        orderBy: orderBy(query.sort),
        select: lostFoundSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        where,
      }),
      prisma.lostFound.count({ where }),
    ]);
    return { items: rows.map((row) => mapLostFoundReport(row, viewerId)), total };
  },

  listBookmarks: async (userId, query) => {
    const where = {
      ...bookmarkableWhere,
      bookmarks: { array_contains: [userId] },
    } satisfies Prisma.LostFoundWhereInput;
    const [rows, total] = await Promise.all([
      prisma.lostFound.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: lostFoundSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        where,
      }),
      prisma.lostFound.count({ where }),
    ]);
    return { items: rows.map((row) => mapLostFoundReport(row, userId)), total };
  },

  listClaims: async (reportId) => {
    const report = await prisma.lostFound.findUnique({
      select: { claims: true },
      where: { id: reportId },
    });
    return report === null ? null : parseLostFoundClaims(report.claims);
  },

  listMyReports: async (userId) => {
    const rows = await prisma.lostFound.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: lostFoundSelect,
      where: { reporterId: userId },
    });
    return rows.map((row) => mapLostFoundReport(row, userId));
  },

  listMatchCandidates: async (sourceId, type, limit, viewerId) => {
    const rows = await prisma.lostFound.findMany({
      orderBy: [{ incidentDate: 'desc' }, { id: 'asc' }],
      select: lostFoundSelect,
      take: limit,
      where: {
        id: { not: sourceId },
        moderationVisibility: ModerationVisibility.VISIBLE,
        reporter: { status: AccountStatus.ACTIVE },
        status: { in: aiMatchCandidateStatuses },
        type,
      },
    });
    return rows.map((row) => mapLostFoundReport(row, viewerId));
  },

  removeBookmark: (userId, reportId) =>
    prisma.$transaction(
      async (transaction) => {
        const report = await transaction.lostFound.findUnique({
          select: { bookmarks: true },
          where: { id: reportId },
        });
        if (report === null) return false;
        const bookmarks = parseStringArray(report.bookmarks);
        const remaining = bookmarks.filter((id) => id !== userId);
        if (remaining.length === bookmarks.length) return false;
        await transaction.lostFound.update({
          data: { bookmarks: remaining },
          where: { id: reportId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  reviewClaim: (reviewerId, canModerate, reportId, claimId, status) =>
    prisma.$transaction(
      async (transaction): Promise<ClaimMutationResult> => {
        const report = await transaction.lostFound.findUnique({
          select: { claims: true, reporterId: true },
          where: { id: reportId },
        });
        if (report === null) return { kind: 'not-found' };
        if (report.reporterId !== reviewerId && !canModerate) return { kind: 'forbidden' };
        const claims = parseLostFoundClaims(report.claims);
        const index = claims.findIndex((claim) => claim.id === claimId);
        const claim = claims[index];
        if (claim === undefined) return { kind: 'not-found' };
        if (claim.status !== ClaimStatus.PENDING) return { kind: 'conflict' };
        const updated: LostFoundClaim = {
          ...claim,
          reviewedAt: new Date().toISOString(),
          reviewerId,
          status,
        };
        claims[index] = updated;
        await transaction.lostFound.update({
          data: { claims: claimsToJson(claims) },
          where: { id: reportId },
        });
        return { claim: updated, kind: 'claim' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  submitClaim: (userId, reportId, message) =>
    prisma.$transaction(
      async (transaction): Promise<ClaimMutationResult> => {
        const report = await transaction.lostFound.findFirst({
          select: { claims: true, reporterId: true },
          where: {
            id: reportId,
            moderationVisibility: ModerationVisibility.VISIBLE,
            status: { in: [LostFoundStatus.OPEN, LostFoundStatus.MATCHED] },
          },
        });
        if (report === null) return { kind: 'not-found' };
        if (report.reporterId === userId) return { kind: 'forbidden' };
        const claims = parseLostFoundClaims(report.claims);
        if (
          claims.some(
            (claim) => claim.claimantId === userId && claim.status === ClaimStatus.PENDING,
          )
        )
          return { kind: 'conflict' };
        const claim: LostFoundClaim = {
          claimantId: userId,
          createdAt: new Date().toISOString(),
          id: randomUUID(),
          message,
          reviewedAt: null,
          reviewerId: null,
          status: ClaimStatus.PENDING,
        };
        await transaction.lostFound.update({
          data: { claims: claimsToJson([...claims, claim]) },
          where: { id: reportId },
        });
        return { claim, kind: 'claim' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  transitionOwned: async (id, reporterId, status, resolvedAt) => {
    const result = await prisma.lostFound.updateMany({
      data: { resolvedAt, status },
      where: { id, moderationVisibility: ModerationVisibility.VISIBLE, reporterId },
    });
    if (result.count === 0) return null;
    const row = await prisma.lostFound.findUnique({ select: lostFoundSelect, where: { id } });
    return row === null ? null : mapLostFoundReport(row, reporterId);
  },

  updateOwned: async (id, reporterId, input) => {
    const result = await prisma.lostFound.updateMany({
      data: input,
      where: { id, moderationVisibility: ModerationVisibility.VISIBLE, reporterId },
    });
    if (result.count === 0) return null;
    const row = await prisma.lostFound.findUnique({ select: lostFoundSelect, where: { id } });
    return row === null ? null : mapLostFoundReport(row, reporterId);
  },
};
