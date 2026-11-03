import { createHash, randomUUID } from 'node:crypto';
import {
  AccountStatus,
  ModerationVisibility,
  Prisma,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';
import { profileAvatarView, storedPhoto } from './profile-avatar-value.js';
import { AppError } from '../../errors/app-error.js';
import type {
  AchievementInput,
  PortfolioLinkInput,
  ProfileAchievement,
  ProfileOptions,
  ProfilePatch,
  ProfilePortfolioLink,
  ProfileRecord,
  SkillInput,
} from './profile.types.js';

export interface ProfileRepository {
  addInterest(userId: string, name: string): Promise<void>;
  addSkill(userId: string, input: SkillInput): Promise<void>;
  createAchievement(userId: string, input: AchievementInput): Promise<void>;
  createPortfolioLink(userId: string, input: Required<PortfolioLinkInput>): Promise<void>;
  deleteAchievement(userId: string, achievementId: string): Promise<boolean>;
  deletePortfolioLink(userId: string, portfolioLinkId: string): Promise<boolean>;
  findByUserId(userId: string, publicOnly: boolean): Promise<ProfileRecord | null>;
  getOptions(): Promise<ProfileOptions>;
  removeInterest(userId: string, interestId: string): Promise<boolean>;
  removeSkill(userId: string, skillId: string): Promise<boolean>;
  updateAchievement(
    userId: string,
    achievementId: string,
    input: AchievementInput,
  ): Promise<boolean>;
  updateCompletion(userId: string, percentage: number): Promise<void>;
  updatePortfolioLink(
    userId: string,
    portfolioLinkId: string,
    input: PortfolioLinkInput,
  ): Promise<boolean>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>;
  updateSkill(userId: string, skillId: string, proficiency: number | null): Promise<boolean>;
}

export class PortfolioLinkConflictError extends Error {
  public constructor() {
    super('Portfolio URL already exists.');
    this.name = 'PortfolioLinkConflictError';
  }
}

const profileSelect = {
  email: true,
  emailVerifiedAt: true,
  id: true,
  profile: {
    select: {
      academicYear: true,
      achievements: true,
      avatar: true,
      bio: true,
      department: true,
      fullName: true,
      interests: true,
      location: true,
      portfolio: true,
      profileCompletion: true,
      skillProficiencies: true,
      skills: true,
    },
  },
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof profileSelect }>;
type JsonObject = Record<string, Prisma.JsonValue>;

const isObject = (value: Prisma.JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stringValue = (value: Prisma.JsonValue | undefined): string | null =>
  typeof value === 'string' ? value : null;
const numberValue = (value: Prisma.JsonValue | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const stableId = (scope: string, value: string): string => {
  const hex = createHash('sha256').update(`${scope}:${value.toLocaleLowerCase()}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const parseAvatar = profileAvatarView;

const skillKey = (name: string): string => name.trim().toLocaleLowerCase();

const parseSkillProficiencies = (value: Prisma.JsonValue): Record<string, number> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, proficiency]) =>
      Number.isInteger(proficiency) && Number(proficiency) >= 1 && Number(proficiency) <= 5
        ? [[skillKey(key), Number(proficiency)]]
        : [],
    ),
  );
};

const parseAchievements = (value: Prisma.JsonValue): ProfileAchievement[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const id = stringValue(entry.id);
    const title = stringValue(entry.title);
    if (id === null || title === null) return [];
    const awardedAtValue = stringValue(entry.awardedAt);
    const awardedAt = awardedAtValue === null ? null : new Date(awardedAtValue);
    return [
      {
        awardedAt: awardedAt !== null && !Number.isNaN(awardedAt.getTime()) ? awardedAt : null,
        description: stringValue(entry.description),
        id,
        title,
      },
    ];
  });
};

const parsePortfolio = (value: Prisma.JsonValue): ProfilePortfolioLink[] => {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (!isObject(entry)) return [];
      const id = stringValue(entry.id);
      const label = stringValue(entry.label);
      const url = stringValue(entry.url);
      if (id === null || label === null || url === null) return [];
      return [{ id, label, sortOrder: numberValue(entry.sortOrder) ?? 0, url }];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
};

const portfolioToJson = (portfolio: readonly ProfilePortfolioLink[]): Prisma.InputJsonArray =>
  portfolio.map(({ id, label, sortOrder, url }) => ({ id, label, sortOrder, url }));

const mapProfileRow = (row: ProfileRow): ProfileRecord | null => {
  if (row.profile === null) return null;
  return {
    academicYear: row.profile.academicYear,
    achievements: parseAchievements(row.profile.achievements),
    avatar: parseAvatar(row.profile.avatar),
    bio: row.profile.bio,
    department: row.profile.department,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    fullName: row.profile.fullName,
    interests: row.profile.interests,
    location: row.profile.location,
    portfolio: parsePortfolio(row.profile.portfolio),
    profileCompletion: row.profile.profileCompletion,
    skillProficiencies: parseSkillProficiencies(row.profile.skillProficiencies),
    skills: row.profile.skills,
    userId: row.id,
  };
};

const uniqueNames = (values: readonly string[]): string[] =>
  [...new Map(values.map((value) => [value.toLocaleLowerCase(), value.trim()])).values()]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

export const createProfileReadRepository = (
  client: Pick<PrismaClient, 'user'> = prisma,
): Pick<ProfileRepository, 'findByUserId'> => ({
  findByUserId: async (userId, publicOnly) => {
    const row = await client.user.findFirst({
      select: profileSelect,
      where: {
        id: userId,
        ...(publicOnly
          ? {
              profile: { is: { moderationVisibility: ModerationVisibility.VISIBLE } },
              status: AccountStatus.ACTIVE,
            }
          : {}),
      },
    });
    return row === null ? null : mapProfileRow(row);
  },
});
const defaultReader = createProfileReadRepository();

export const profileRepository: ProfileRepository = {
  addInterest: (userId, name) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUniqueOrThrow({
          select: { interests: true },
          where: { userId },
        });
        await transaction.profile.update({
          data: { interests: uniqueNames([...profile.interests, name]) },
          where: { userId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  addSkill: (userId, { name, proficiency }) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUniqueOrThrow({
          select: { skillProficiencies: true, skills: true },
          where: { userId },
        });
        const skillProficiencies = parseSkillProficiencies(profile.skillProficiencies);
        if (proficiency === null) delete skillProficiencies[skillKey(name)];
        else skillProficiencies[skillKey(name)] = proficiency;
        await transaction.profile.update({
          data: { skillProficiencies, skills: uniqueNames([...profile.skills, name]) },
          where: { userId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  createAchievement: (userId, input) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUniqueOrThrow({
          select: { achievements: true },
          where: { userId },
        });
        const achievements = parseAchievements(profile.achievements);
        achievements.push({
          awardedAt: input.awardedAt ?? null,
          description: input.description ?? null,
          id: randomUUID(),
          title: input.title ?? '',
        });
        await transaction.profile.update({
          data: {
            achievements: achievements.map((item) => ({
              ...item,
              awardedAt: item.awardedAt?.toISOString() ?? null,
            })),
          },
          where: { userId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  createPortfolioLink: (userId, input) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUniqueOrThrow({
          select: { portfolio: true },
          where: { userId },
        });
        const portfolio = parsePortfolio(profile.portfolio);
        if (portfolio.some((item) => item.url === input.url))
          throw new PortfolioLinkConflictError();
        portfolio.push({ id: randomUUID(), ...input });
        await transaction.profile.update({
          data: { portfolio: portfolioToJson(portfolio) },
          where: { userId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  deleteAchievement: (userId, achievementId) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUnique({
          select: { achievements: true },
          where: { userId },
        });
        if (profile === null) return false;
        const achievements = parseAchievements(profile.achievements);
        const remaining = achievements.filter((item) => item.id !== achievementId);
        if (remaining.length === achievements.length) return false;
        await transaction.profile.update({
          data: {
            achievements: remaining.map((item) => ({
              ...item,
              awardedAt: item.awardedAt?.toISOString() ?? null,
            })),
          },
          where: { userId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  deletePortfolioLink: (userId, portfolioLinkId) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUnique({
          select: { portfolio: true },
          where: { userId },
        });
        if (profile === null) return false;
        const portfolio = parsePortfolio(profile.portfolio);
        const remaining = portfolio.filter((item) => item.id !== portfolioLinkId);
        if (remaining.length === portfolio.length) return false;
        await transaction.profile.update({
          data: { portfolio: portfolioToJson(remaining) },
          where: { userId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  findByUserId: (userId, publicOnly) => defaultReader.findByUserId(userId, publicOnly),

  getOptions: async () => {
    const profiles = await prisma.profile.findMany({
      select: { department: true, interests: true, skills: true },
      where: { moderationVisibility: ModerationVisibility.VISIBLE },
    });
    const departments = uniqueNames(
      profiles.flatMap(({ department }) => (department === null ? [] : [department])),
    ).map((name) => ({ code: name, id: name, name }));
    const interests = uniqueNames(profiles.flatMap(({ interests: values }) => values)).map(
      (name) => ({ id: stableId('interest', name), name }),
    );
    const skills = uniqueNames(profiles.flatMap(({ skills: values }) => values)).map((name) => ({
      id: stableId('skill', name),
      name,
    }));
    return { departments, interests, skills };
  },

  removeInterest: (userId, interestId) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUnique({
          select: { interests: true },
          where: { userId },
        });
        if (profile === null) return false;
        const interests = profile.interests.filter(
          (name) => stableId('interest', name) !== interestId,
        );
        if (interests.length === profile.interests.length) return false;
        await transaction.profile.update({ data: { interests }, where: { userId } });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  removeSkill: (userId, skillId) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUnique({
          select: { skillProficiencies: true, skills: true },
          where: { userId },
        });
        if (profile === null) return false;
        const skills = profile.skills.filter((name) => stableId('skill', name) !== skillId);
        if (skills.length === profile.skills.length) return false;
        const removed = profile.skills.find((name) => stableId('skill', name) === skillId);
        const skillProficiencies = parseSkillProficiencies(profile.skillProficiencies);
        if (removed !== undefined) delete skillProficiencies[skillKey(removed)];
        await transaction.profile.update({
          data: { skillProficiencies, skills },
          where: { userId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  updateAchievement: (userId, achievementId, input) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUnique({
          select: { achievements: true },
          where: { userId },
        });
        if (profile === null) return false;
        const achievements = parseAchievements(profile.achievements);
        const index = achievements.findIndex((item) => item.id === achievementId);
        if (index < 0) return false;
        const current = achievements[index];
        if (current === undefined) return false;
        achievements[index] = {
          awardedAt: input.awardedAt === undefined ? current.awardedAt : input.awardedAt,
          description: input.description === undefined ? current.description : input.description,
          id: current.id,
          title: input.title ?? current.title,
        };
        await transaction.profile.update({
          data: {
            achievements: achievements.map((item) => ({
              ...item,
              awardedAt: item.awardedAt?.toISOString() ?? null,
            })),
          },
          where: { userId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  updateCompletion: async (userId, profileCompletion) => {
    await prisma.profile.update({ data: { profileCompletion }, where: { userId } });
  },

  updatePortfolioLink: (userId, portfolioLinkId, input) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUnique({
          select: { portfolio: true },
          where: { userId },
        });
        if (profile === null) return false;
        const portfolio = parsePortfolio(profile.portfolio);
        const index = portfolio.findIndex((item) => item.id === portfolioLinkId);
        if (index < 0) return false;
        const current = portfolio[index];
        if (current === undefined) return false;
        const updated: ProfilePortfolioLink = {
          id: current.id,
          label: input.label ?? current.label,
          sortOrder: input.sortOrder ?? current.sortOrder,
          url: input.url ?? current.url,
        };
        if (portfolio.some((item, itemIndex) => itemIndex !== index && item.url === updated.url))
          throw new PortfolioLinkConflictError();
        portfolio[index] = updated;
        await transaction.profile.update({
          data: { portfolio: portfolioToJson(portfolio) },
          where: { userId },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),

  updateProfile: async (userId, patch) => {
    if (patch.avatar === undefined) {
      await prisma.profile.update({ data: patch, where: { userId } });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.users WHERE id=${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true, profile: { select: { avatar: true } } },
      });
      if (user?.status !== 'ACTIVE' || !user.profile)
        throw new AppError({
          code: 'PROFILE_ACCESS_DENIED',
          message: 'An active profile is required.',
          statusCode: 403,
        });
      if (storedPhoto(user.profile.avatar))
        throw new AppError({
          code: 'PROFILE_PHOTO_MANAGED',
          message:
            'Remove your uploaded photo in the photo editor before selecting a predefined avatar.',
          statusCode: 409,
        });
      await tx.profile.update({ data: patch, where: { userId } });
    });
  },

  updateSkill: (userId, skillId, proficiency) =>
    prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.profile.findUnique({
          select: { skillProficiencies: true, skills: true },
          where: { userId },
        });
        if (profile === null) return false;
        const skill = profile.skills.find((name) => stableId('skill', name) === skillId);
        if (skill === undefined) return false;
        const skillProficiencies = parseSkillProficiencies(profile.skillProficiencies);
        if (proficiency === null) delete skillProficiencies[skillKey(skill)];
        else skillProficiencies[skillKey(skill)] = proficiency;
        await transaction.profile.update({ data: { skillProficiencies }, where: { userId } });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
};

export const profileValueId = stableId;
