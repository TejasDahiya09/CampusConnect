import { profileAvatarView } from '../profile/profile-avatar-value.js';
import { AppError } from '../../errors/app-error.js';
import { applicationDeadlineExpired, requireActiveTeamUpAccount } from './teamup-policy.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ModerationVisibility,
  Prisma,
  ProjectStatus,
} from '../../generated/prisma/client.js';
import type {
  TeamUpApplicationRecord,
  TeamUpApplicationStatus,
  TeamUpApplicationView,
  TeamUpCreateInput,
  TeamUpMemberRecord,
  TeamUpPerson,
  TeamUpProjectSummary,
  TeamUpProjectView,
  TeamUpQuery,
  TeamUpUpdateInput,
  TeamUpWorkspace,
} from './teamup.types.js';

const select = {
  applications: true,
  category: true,
  createdAt: true,
  deadline: true,
  description: true,
  featuredOnLanding: true,
  id: true,
  maxMembers: true,
  members: true,
  owner: {
    select: {
      id: true,
      profile: {
        select: { avatar: true, department: true, fullName: true, moderationVisibility: true },
      },
    },
  },
  ownerId: true,
  requiredSkills: true,
  status: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.TeamUpSelect;
type Row = Prisma.TeamUpGetPayload<{ select: typeof select }>;

const person = (user: Row['owner']): TeamUpPerson => ({
  avatar:
    user.profile?.moderationVisibility === ModerationVisibility.VISIBLE
      ? profileAvatarView(user.profile.avatar)
      : null,
  department:
    user.profile?.moderationVisibility === ModerationVisibility.VISIBLE
      ? user.profile.department
      : null,
  displayName:
    user.profile?.moderationVisibility === ModerationVisibility.VISIBLE
      ? user.profile.fullName
      : 'CampusConnect student',
  id: user.id,
});
const record = (value: Prisma.JsonValue): Record<string, Prisma.JsonValue> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
const applications = (value: Prisma.JsonValue): TeamUpApplicationRecord[] =>
  !Array.isArray(value)
    ? []
    : value.flatMap((item) => {
        const row = record(item);
        if (
          row === null ||
          typeof row.id !== 'string' ||
          typeof row.applicantId !== 'string' ||
          typeof row.createdAt !== 'string' ||
          typeof row.status !== 'string' ||
          !['PENDING', 'ACCEPTED', 'REJECTED'].includes(row.status)
        )
          return [];
        return [
          {
            applicantId: row.applicantId,
            createdAt: row.createdAt,
            id: row.id,
            message: typeof row.message === 'string' ? row.message : null,
            reviewedAt: typeof row.reviewedAt === 'string' ? row.reviewedAt : null,
            reviewerId: typeof row.reviewerId === 'string' ? row.reviewerId : null,
            status: row.status as TeamUpApplicationStatus,
          },
        ];
      });
const members = (value: Prisma.JsonValue): TeamUpMemberRecord[] =>
  !Array.isArray(value)
    ? []
    : value.flatMap((item) => {
        const row = record(item);
        return row !== null &&
          typeof row.userId === 'string' &&
          typeof row.joinedAt === 'string' &&
          typeof row.applicationId === 'string'
          ? [{ applicationId: row.applicationId, joinedAt: row.joinedAt, userId: row.userId }]
          : [];
      });
const json = (
  value: readonly (TeamUpApplicationRecord | TeamUpMemberRecord)[],
): Prisma.InputJsonArray => value as unknown as Prisma.InputJsonArray;
const summary = (row: Row, viewerId?: string): TeamUpProjectSummary => {
  const projectApplications = applications(row.applications);
  const projectMembers = members(row.members);
  return {
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    currentMemberCount: projectMembers.length + 1,
    deadline: row.deadline?.toISOString().slice(0, 10) ?? null,
    description: row.description,
    ...(viewerId === row.ownerId ? { featuredOnLanding: row.featuredOnLanding } : {}),
    id: row.id,
    maxMembers: row.maxMembers,
    owner: person(row.owner),
    ownerId: row.ownerId,
    requiredSkills: row.requiredSkills,
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    viewerApplicationStatus:
      viewerId === undefined
        ? null
        : (projectApplications.find(({ applicantId }) => applicantId === viewerId)?.status ?? null),
    viewerIsMember:
      viewerId !== undefined && projectMembers.some(({ userId }) => userId === viewerId),
    viewerIsOwner: viewerId === row.ownerId,
  };
};
const people = async (
  ids: readonly string[],
  db: typeof prisma = prisma,
): Promise<Map<string, TeamUpPerson>> => {
  const users = await db.user.findMany({
    select: {
      id: true,
      profile: {
        select: { avatar: true, department: true, fullName: true, moderationVisibility: true },
      },
    },
    where: {
      id: { in: [...new Set(ids)] },
      status: AccountStatus.ACTIVE,
      profile: { is: { moderationVisibility: ModerationVisibility.VISIBLE } },
    },
  });
  return new Map(users.map((user) => [user.id, person(user)]));
};
const orderBy = (sort: TeamUpQuery['sort']): Prisma.TeamUpOrderByWithRelationInput[] =>
  sort === 'oldest'
    ? [{ createdAt: 'asc' }, { id: 'asc' }]
    : sort === 'deadline'
      ? [{ deadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }];

export type ReviewResult =
  | {
      readonly kind: 'application';
      readonly application: TeamUpApplicationRecord;
      readonly project: TeamUpProjectSummary;
    }
  | { readonly kind: 'capacity' | 'conflict' | 'forbidden' | 'not-found' | 'closed' };

export const createTeamUpRepository = (
  db: typeof prisma = prisma,
  now: () => Date = () => new Date(),
) => {
  const transact = async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await db.$transaction(run, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        // adapter-pg nests SQLSTATE under driverAdapterError.cause for raw queries.
        const adapter =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.meta?.driverAdapterError
            : undefined;
        const cause =
          adapter && typeof adapter === 'object' && 'cause' in adapter ? adapter.cause : undefined;
        const originalCode =
          cause && typeof cause === 'object' && 'originalCode' in cause
            ? cause.originalCode
            : undefined;
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' &&
              ['40001', '40P01'].includes(String(error.meta?.code ?? originalCode))));
        if (!retryable) throw error;
        if (attempt === 2)
          throw new AppError({
            code: 'TEAMUP_CONCURRENCY_CONFLICT',
            message: 'The project changed. Refresh and try again.',
            statusCode: 409,
          });
      }
    }
    throw new Error('Unreachable transaction retry state.');
  };
  return {
    create: async (ownerId: string, input: TeamUpCreateInput) =>
      transact(async (tx) => {
        await requireActiveTeamUpAccount(tx, ownerId, true);
        return summary(
          await tx.teamUp.create({
            data: {
              ...input,
              featuredOnLanding: input.featuredOnLanding ?? false,
              ownerId,
              requiredSkills: [...input.requiredSkills],
            },
            select,
          }),
          ownerId,
        );
      }),
    findById: async (id: string, viewerId?: string): Promise<TeamUpProjectView | null> => {
      const row = await db.teamUp.findFirst({
        select,
        where: {
          id,
          moderationVisibility: ModerationVisibility.VISIBLE,
          owner: { status: AccountStatus.ACTIVE },
        },
      });
      if (!row) return null;
      const projectMembers = members(row.members);
      const byId = await people(
        projectMembers.map(({ userId }) => userId),
        db,
      );
      return {
        ...summary(row, viewerId),
        members: projectMembers.flatMap(({ userId }) => byId.get(userId) ?? []),
      };
    },
    list: async (query: TeamUpQuery, viewerId?: string) => {
      const where: Prisma.TeamUpWhereInput = {
        moderationVisibility: ModerationVisibility.VISIBLE,
        owner: { status: AccountStatus.ACTIVE },
        ...(query.keyword === undefined
          ? {}
          : {
              OR: [
                { title: { contains: query.keyword, mode: 'insensitive' } },
                { description: { contains: query.keyword, mode: 'insensitive' } },
                { category: { contains: query.keyword, mode: 'insensitive' } },
                { requiredSkills: { has: query.keyword } },
              ],
            }),
        ...(query.skill === undefined ? {} : { requiredSkills: { has: query.skill } }),
        ...(query.status === undefined ? {} : { status: query.status }),
      };
      const [rows, total] = await Promise.all([
        db.teamUp.findMany({
          orderBy: orderBy(query.sort),
          select,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where,
        }),
        db.teamUp.count({ where }),
      ]);
      return { items: rows.map((row) => summary(row, viewerId)), total };
    },
    updateOwned: async (
      ownerId: string,
      id: string,
      input: TeamUpUpdateInput,
    ): Promise<TeamUpProjectSummary | null | 'capacity'> =>
      transact(async (tx) => {
        await requireActiveTeamUpAccount(tx, ownerId, true);
        const current = await tx.teamUp.findUnique({
          select: { maxMembers: true, members: true, ownerId: true, status: true },
          where: {
            id,
            moderationVisibility: ModerationVisibility.VISIBLE,
            owner: { status: AccountStatus.ACTIVE },
          },
        });
        if (!current || current.ownerId !== ownerId) return null;
        if (current.status !== ProjectStatus.OPEN && current.status !== ProjectStatus.FULL)
          return null;
        const currentCount = members(current.members).length + 1;
        if (input.maxMembers !== undefined && input.maxMembers < currentCount) return 'capacity';
        const status =
          input.maxMembers === undefined
            ? current.status
            : input.maxMembers === currentCount
              ? ProjectStatus.FULL
              : ProjectStatus.OPEN;
        const data: Prisma.TeamUpUpdateInput = {
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.featuredOnLanding === undefined
            ? {}
            : { featuredOnLanding: input.featuredOnLanding }),
          ...(input.maxMembers === undefined ? {} : { maxMembers: input.maxMembers }),
          ...(input.requiredSkills === undefined
            ? {}
            : { requiredSkills: [...input.requiredSkills] }),
          ...(input.title === undefined ? {} : { title: input.title }),
          status,
        };
        return summary(await tx.teamUp.update({ data, select, where: { id } }), ownerId);
      }),
    apply: async (
      applicantId: string,
      projectId: string,
      message: string | null,
    ): Promise<
      TeamUpApplicationRecord | 'conflict' | 'forbidden' | 'not-found' | 'expired' | 'capacity'
    > =>
      transact(async (tx) => {
        await requireActiveTeamUpAccount(tx, applicantId, true);
        const row = await tx.teamUp.findFirst({
          select: {
            applications: true,
            deadline: true,
            maxMembers: true,
            members: true,
            ownerId: true,
            status: true,
          },
          where: {
            id: projectId,
            moderationVisibility: ModerationVisibility.VISIBLE,
            owner: { status: AccountStatus.ACTIVE },
          },
        });
        if (!row) return 'not-found';
        if (row.status === ProjectStatus.FULL) return 'capacity';
        if (row.status !== ProjectStatus.OPEN) return 'not-found';
        await requireActiveTeamUpAccount(tx, row.ownerId, true);
        if (applicationDeadlineExpired(row.deadline, now())) return 'expired';
        if (
          row.ownerId === applicantId ||
          members(row.members).some(({ userId }) => userId === applicantId)
        )
          return 'forbidden';
        const current = applications(row.applications);
        if (current.some((application) => application.applicantId === applicantId))
          return 'conflict';
        if (members(row.members).length + 1 >= row.maxMembers) return 'capacity';
        const application: TeamUpApplicationRecord = {
          applicantId,
          createdAt: new Date().toISOString(),
          id: randomUUID(),
          message,
          reviewedAt: null,
          reviewerId: null,
          status: 'PENDING',
        };
        await tx.teamUp.update({
          data: { applications: json([...current, application]) },
          where: { id: projectId },
        });
        return application;
      }),
    listApplications: async (
      ownerId: string,
      projectId: string,
    ): Promise<readonly TeamUpApplicationView[] | 'forbidden' | 'not-found'> => {
      await requireActiveTeamUpAccount(db, ownerId);
      const row = await db.teamUp.findFirst({
        select: { applications: true, ownerId: true },
        where: {
          id: projectId,
          moderationVisibility: ModerationVisibility.VISIBLE,
          owner: { status: AccountStatus.ACTIVE },
        },
      });
      if (!row) return 'not-found';
      if (row.ownerId !== ownerId) return 'forbidden';
      const records = applications(row.applications);
      const byId = await people(
        records.map(({ applicantId }) => applicantId),
        db,
      );
      return records.flatMap((application) => {
        const applicant = byId.get(application.applicantId);
        return applicant ? [{ ...application, applicant }] : [];
      });
    },
    review: async (
      ownerId: string,
      projectId: string,
      applicationId: string,
      decision: 'ACCEPTED' | 'REJECTED',
    ): Promise<ReviewResult> =>
      transact(async (tx): Promise<ReviewResult> => {
        await requireActiveTeamUpAccount(tx, ownerId, true);
        const row = await tx.teamUp.findFirst({
          select: {
            applications: true,
            maxMembers: true,
            members: true,
            ownerId: true,
            status: true,
          },
          where: {
            id: projectId,
            moderationVisibility: ModerationVisibility.VISIBLE,
            owner: { status: AccountStatus.ACTIVE },
          },
        });
        if (!row) return { kind: 'not-found' };
        if (row.ownerId !== ownerId) return { kind: 'forbidden' };
        if (row.status !== ProjectStatus.OPEN && row.status !== ProjectStatus.FULL)
          return { kind: 'closed' };
        const projectApplications = applications(row.applications);
        const index = projectApplications.findIndex(({ id }) => id === applicationId);
        const existing = projectApplications[index];
        if (!existing) return { kind: 'not-found' };
        if (existing.status !== 'PENDING') return { kind: 'conflict' };
        if (decision === 'ACCEPTED')
          await requireActiveTeamUpAccount(tx, existing.applicantId, true);
        const projectMembers = members(row.members);
        if (
          decision === 'ACCEPTED' &&
          projectMembers.some(({ userId }) => userId === existing.applicantId)
        )
          return { kind: 'conflict' };
        if (
          decision === 'ACCEPTED' &&
          (row.status !== ProjectStatus.OPEN || projectMembers.length + 1 >= row.maxMembers)
        )
          return { kind: 'capacity' };
        const application: TeamUpApplicationRecord = {
          ...existing,
          reviewedAt: new Date().toISOString(),
          reviewerId: ownerId,
          status: decision,
        };
        projectApplications[index] = application;
        const nextMembers =
          decision === 'ACCEPTED' &&
          !projectMembers.some(({ userId }) => userId === existing.applicantId)
            ? [
                ...projectMembers,
                { applicationId, joinedAt: new Date().toISOString(), userId: existing.applicantId },
              ]
            : projectMembers;
        const status = nextMembers.length + 1 >= row.maxMembers ? ProjectStatus.FULL : row.status;
        const updated = await tx.teamUp.update({
          data: { applications: json(projectApplications), members: json(nextMembers), status },
          select,
          where: { id: projectId },
        });
        return { application, kind: 'application', project: summary(updated, ownerId) };
      }),
    transition: async (
      ownerId: string,
      projectId: string,
      status: ProjectStatus,
    ): Promise<TeamUpProjectSummary | 'forbidden' | 'not-found'> =>
      transact(async (tx) => {
        await requireActiveTeamUpAccount(tx, ownerId, true);
        const row = await tx.teamUp.findFirst({
          select: { ownerId: true, status: true },
          where: {
            id: projectId,
            moderationVisibility: ModerationVisibility.VISIBLE,
            owner: { status: AccountStatus.ACTIVE },
          },
        });
        if (!row) return 'not-found';
        if (row.ownerId !== ownerId) return 'forbidden';
        const allowed: Record<ProjectStatus, readonly ProjectStatus[]> = {
          OPEN: [ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED],
          FULL: [ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED],
          COMPLETED: [ProjectStatus.ARCHIVED],
          ARCHIVED: [],
        };
        if (!allowed[row.status].includes(status)) return 'not-found';
        return summary(
          await tx.teamUp.update({ data: { status }, select, where: { id: projectId } }),
          ownerId,
        );
      }),
    workspace: async (userId: string): Promise<TeamUpWorkspace> => {
      await requireActiveTeamUpAccount(db, userId);
      const visible = {
        moderationVisibility: ModerationVisibility.VISIBLE,
        owner: { status: AccountStatus.ACTIVE },
      };
      const [ownedRows, joinedRows, applicationRows] = await Promise.all([
        db.teamUp.findMany({
          orderBy: { updatedAt: 'desc' },
          select,
          where: { ...visible, ownerId: userId },
        }),
        db.teamUp.findMany({
          orderBy: { updatedAt: 'desc' },
          select,
          where: { ...visible, members: { array_contains: [{ userId }] } },
        }),
        db.teamUp.findMany({
          orderBy: { updatedAt: 'desc' },
          select,
          where: { ...visible, applications: { array_contains: [{ applicantId: userId }] } },
        }),
      ]);
      const applicationViews = applicationRows.flatMap((row) =>
        applications(row.applications)
          .filter(({ applicantId }) => applicantId === userId)
          .map((application) => ({
            ...application,
            applicant: { avatar: null, department: null, displayName: 'You', id: userId },
            project: summary(row, userId),
          })),
      );
      return {
        applications: applicationViews,
        joined: joinedRows.map((row) => summary(row, userId)),
        owned: ownedRows.map((row) => summary(row, userId)),
      };
    },
  };
};

export const teamUpRepository = createTeamUpRepository();

export type TeamUpRepository = typeof teamUpRepository;
