import { profileAvatarView } from '../profile/profile-avatar-value.js';
import { applicationDeadlineExpired, requireActiveTeamUpAccount } from '../teamup/teamup-policy.js';
import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ModerationVisibility,
  ProjectStatus,
} from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../errors/app-error.js';
import { combineScore, explicitSignals, semanticScores } from './recommendation-scoring.js';
import type { MatchExplanation, PublicStudent } from './students.types.js';
import { parseStudentDiscovery } from './students.validation.js';

const publicStudent = (row: {
  id: string;
  profile: {
    avatar: Prisma.JsonValue;
    bio: string | null;
    department: string | null;
    fullName: string;
    interests: string[];
    skills: string[];
  } | null;
}): PublicStudent | null =>
  row.profile
    ? {
        avatar: profileAvatarView(row.profile.avatar),
        bio: row.profile.bio,
        department: row.profile.department,
        displayName: row.profile.fullName,
        id: row.id,
        interests: row.profile.interests,
        skills: row.profile.skills,
      }
    : null;
const jsonRecords = (value: Prisma.JsonValue) =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, Prisma.JsonValue> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
const explanation = (
  requirements: readonly string[],
  skills: readonly string[],
  interests: readonly string[],
  semantic: number | null,
): MatchExplanation | null => {
  const signals = explicitSignals(requirements, skills, interests);
  if (signals.matchedSkills.length === 0 && signals.relevantInterests.length === 0) return null;
  const score = combineScore(signals.skillRatio, semantic, signals.interestRatio);
  const label =
    signals.skillRatio >= 0.75
      ? 'Strong skill alignment'
      : signals.skillRatio >= 0.35
        ? 'Relevant skill alignment'
        : 'Partial skill alignment';
  const reasons = [
    signals.matchedSkills.length
      ? `Matches ${signals.matchedSkills.length} of ${requirements.length} required skills: ${signals.matchedSkills.join(', ')}.`
      : 'A public interest directly matches a requested project skill.',
    ...(signals.relevantInterests.length
      ? [`Relevant interests: ${signals.relevantInterests.join(', ')}.`]
      : []),
  ];
  return {
    label,
    matchedSkills: signals.matchedSkills,
    missingSkills: signals.missingSkills,
    reasons,
    score: Number(score.toFixed(4)),
    semanticAvailable: semantic !== null,
  };
};

export const createStudentsService = (
  db: typeof prisma = prisma,
  score: typeof semanticScores = semanticScores,
) => ({
  discover: async (viewerId: string, raw: Record<string, unknown>) => {
    const query = parseStudentDiscovery(raw);
    const where: Prisma.UserWhereInput = {
      id: { not: viewerId },
      status: AccountStatus.ACTIVE,
      profile: {
        is: {
          moderationVisibility: ModerationVisibility.VISIBLE,
          ...(query.search ? { fullName: { contains: query.search, mode: 'insensitive' } } : {}),
          ...(query.department
            ? { department: { equals: query.department, mode: 'insensitive' } }
            : {}),
          ...(query.skill ? { skills: { has: query.skill } } : {}),
          ...(query.interest ? { interests: { has: query.interest } } : {}),
        },
      },
    };
    const select = {
      id: true,
      profile: {
        select: {
          avatar: true,
          bio: true,
          department: true,
          fullName: true,
          interests: true,
          skills: true,
        },
      },
    } satisfies Prisma.UserSelect;
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select,
        orderBy: [{ profile: { fullName: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);
    return {
      students: rows.flatMap((row) => publicStudent(row) ?? []),
      pagination: { ...query, total, totalPages: Math.ceil(total / query.limit) },
    };
  },
  recommendedStudents: async (ownerId: string, projectId: string) => {
    await requireActiveTeamUpAccount(db, ownerId);
    const project = await db.teamUp.findFirst({
      where: {
        id: projectId,
        moderationVisibility: ModerationVisibility.VISIBLE,
        owner: { status: AccountStatus.ACTIVE },
      },
      select: {
        applications: true,
        deadline: true,
        maxMembers: true,
        description: true,
        id: true,
        members: true,
        ownerId: true,
        requiredSkills: true,
        status: true,
        title: true,
      },
    });
    if (!project)
      throw new AppError({
        code: 'TEAMUP_PROJECT_NOT_FOUND',
        message: 'The TeamUp project was not found.',
        statusCode: 404,
      });
    if (project.ownerId !== ownerId)
      throw new AppError({
        code: 'TEAMUP_RECOMMENDATIONS_FORBIDDEN',
        message: 'Only the project owner can recruit collaborators.',
        statusCode: 403,
      });
    if (
      project.status !== ProjectStatus.OPEN ||
      jsonRecords(project.members).length + 1 >= project.maxMembers ||
      applicationDeadlineExpired(project.deadline)
    )
      return [];
    const excluded = new Set([
      ownerId,
      ...jsonRecords(project.applications).flatMap((item) =>
        typeof item.applicantId === 'string' ? [item.applicantId] : [],
      ),
      ...jsonRecords(project.members).flatMap((item) =>
        typeof item.userId === 'string' ? [item.userId] : [],
      ),
    ]);
    const rows = await db.user.findMany({
      where: {
        id: { notIn: [...excluded] },
        status: AccountStatus.ACTIVE,
        profile: { is: { moderationVisibility: ModerationVisibility.VISIBLE } },
      },
      take: 100,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        profile: {
          select: {
            avatar: true,
            bio: true,
            department: true,
            fullName: true,
            interests: true,
            skills: true,
          },
        },
      },
    });
    const students = rows.flatMap((row) => publicStudent(row) ?? []);
    const semantic = await score(
      `${project.title}\n${project.description}\n${project.requiredSkills.join(' ')}`,
      students.map((student) => ({
        id: student.id,
        text: `${student.bio ?? ''}\n${student.skills.join(' ')}\n${student.interests.join(' ')}`,
      })),
    );
    return students
      .flatMap((student) => {
        const match = explanation(
          project.requiredSkills,
          student.skills,
          student.interests,
          semantic?.get(student.id) ?? null,
        );
        return match ? [{ match, student }] : [];
      })
      .sort((a, b) => b.match.score - a.match.score || a.student.id.localeCompare(b.student.id))
      .slice(0, 12);
  },
  recommendedProjects: async (userId: string) => {
    await requireActiveTeamUpAccount(db, userId);
    const profile = await db.profile.findUnique({
      where: { userId },
      select: { bio: true, interests: true, skills: true },
    });
    if (!profile) return [];
    const rows = await db.teamUp.findMany({
      where: {
        moderationVisibility: ModerationVisibility.VISIBLE,
        ownerId: { not: userId },
        owner: { status: AccountStatus.ACTIVE },
        OR: [
          { deadline: null },
          { deadline: { gte: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z') } },
        ],
        status: ProjectStatus.OPEN,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        applications: true,
        category: true,
        createdAt: true,
        deadline: true,
        description: true,
        id: true,
        maxMembers: true,
        members: true,
        ownerId: true,
        requiredSkills: true,
        status: true,
        title: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            profile: {
              select: {
                avatar: true,
                department: true,
                fullName: true,
                moderationVisibility: true,
              },
            },
          },
        },
      },
    });
    const eligible = rows.filter(
      (row) =>
        !jsonRecords(row.members).some((item) => item.userId === userId) &&
        !jsonRecords(row.applications).some((item) => item.applicantId === userId) &&
        jsonRecords(row.members).length + 1 < row.maxMembers &&
        !applicationDeadlineExpired(row.deadline),
    );
    const semantic = await score(
      `${profile.bio ?? ''}\n${profile.skills.join(' ')}\n${profile.interests.join(' ')}`,
      eligible.map((project) => ({
        id: project.id,
        text: `${project.title}\n${project.description}\n${project.requiredSkills.join(' ')}`,
      })),
    );
    return eligible
      .flatMap((project) => {
        const match = explanation(
          project.requiredSkills,
          profile.skills,
          profile.interests,
          semantic?.get(project.id) ?? null,
        );
        if (!match) return [];
        const application = jsonRecords(project.applications).find(
          (item) => item.applicantId === userId,
        );
        return [
          {
            match,
            project: {
              ...project,
              applications: undefined,
              members: undefined,
              currentMemberCount: jsonRecords(project.members).length + 1,
              deadline: project.deadline?.toISOString().slice(0, 10) ?? null,
              createdAt: project.createdAt.toISOString(),
              updatedAt: project.updatedAt.toISOString(),
              owner: {
                avatar:
                  project.owner.profile?.moderationVisibility === ModerationVisibility.VISIBLE
                    ? profileAvatarView(project.owner.profile.avatar)
                    : null,
                department:
                  project.owner.profile?.moderationVisibility === ModerationVisibility.VISIBLE
                    ? project.owner.profile.department
                    : null,
                displayName:
                  project.owner.profile?.moderationVisibility === ModerationVisibility.VISIBLE
                    ? project.owner.profile.fullName
                    : 'CampusConnect student',
                id: project.owner.id,
              },
              viewerApplicationStatus:
                typeof application?.status === 'string' ? application.status : null,
              viewerIsMember: false,
              viewerIsOwner: false,
            },
          },
        ];
      })
      .sort((a, b) => b.match.score - a.match.score || a.project.id.localeCompare(b.project.id))
      .slice(0, 12);
  },
});

export const studentsService = createStudentsService();
