import { AppError } from '../../errors/app-error.js';
import { calculateProfileCompletion } from './profile-completion.js';
import {
  PortfolioLinkConflictError,
  profileRepository,
  profileValueId,
  type ProfileRepository,
} from './profile.repository.js';
import type {
  AchievementInput,
  PortfolioLinkInput,
  ProfileOptions,
  ProfilePatch,
  ProfileRecord,
  ProfileView,
  SkillInput,
} from './profile.types.js';

export interface ProfileService {
  addInterest(userId: string, name: string): Promise<ProfileView>;
  addSkill(userId: string, input: SkillInput): Promise<ProfileView>;
  createAchievement(userId: string, input: AchievementInput): Promise<ProfileView>;
  createPortfolioLink(userId: string, input: PortfolioLinkInput): Promise<ProfileView>;
  deleteAchievement(userId: string, achievementId: string): Promise<ProfileView>;
  deletePortfolioLink(userId: string, portfolioLinkId: string): Promise<ProfileView>;
  getOwnProfile(userId: string): Promise<ProfileView>;
  getProfileOptions(): Promise<ProfileOptions>;
  getPublicProfile(userId: string): Promise<ProfileView>;
  removeInterest(userId: string, interestId: string): Promise<ProfileView>;
  removeSkill(userId: string, skillId: string): Promise<ProfileView>;
  updateAchievement(
    userId: string,
    achievementId: string,
    input: AchievementInput,
  ): Promise<ProfileView>;
  updateOwnProfile(userId: string, patch: ProfilePatch): Promise<ProfileView>;
  updatePortfolioLink(
    userId: string,
    portfolioLinkId: string,
    input: PortfolioLinkInput,
  ): Promise<ProfileView>;
  updateSkill(userId: string, skillId: string, proficiency: number | null): Promise<ProfileView>;
}

const universityDomain = (email: string): string | null =>
  email.split('@')[1]?.toLowerCase() ?? null;
const departmentView = (department: string | null) =>
  department === null ? null : { code: department, id: department, name: department };

const toProfileView = (record: ProfileRecord, includeCompletion: boolean): ProfileView => {
  const completion = calculateProfileCompletion(record);
  const view = {
    achievements: record.achievements.map((achievement) => ({
      ...achievement,
      awardedAt: achievement.awardedAt?.toISOString().slice(0, 10) ?? null,
    })),
    avatar: record.avatar,
    bio: record.bio,
    department: departmentView(record.department),
    departmentId: record.department,
    displayName: record.fullName,
    interests: record.interests.map((name) => ({ id: profileValueId('interest', name), name })),
    location: record.location,
    portfolioLinks: record.portfolio,
    profileId: record.userId,
    skills: record.skills.map((name) => ({
      id: profileValueId('skill', name),
      name,
      proficiency: record.skillProficiencies[name.trim().toLocaleLowerCase()] ?? null,
    })),
    universityDomain: universityDomain(record.email),
    userId: record.userId,
    year: record.academicYear,
  } as const;
  return includeCompletion ? { ...view, completion } : view;
};

const notFound = (resource: string): AppError =>
  new AppError({
    code: `${resource.toUpperCase()}_NOT_FOUND`,
    message: `The requested ${resource.toLowerCase()} was not found.`,
    statusCode: 404,
  });

export const createProfileService = (
  repository: ProfileRepository = profileRepository,
): ProfileService => {
  const getRecord = async (userId: string, publicOnly: boolean): Promise<ProfileRecord> => {
    const profile = await repository.findByUserId(userId, publicOnly);
    if (profile === null) throw notFound('PROFILE');
    return profile;
  };
  const getOwnProfile = async (userId: string): Promise<ProfileView> =>
    toProfileView(await getRecord(userId, false), true);
  const mutateAndGet = async (
    userId: string,
    mutation: () => Promise<void>,
  ): Promise<ProfileView> => {
    await mutation();
    const record = await getRecord(userId, false);
    const completion = calculateProfileCompletion(record);
    if (completion.percentage !== record.profileCompletion)
      await repository.updateCompletion(userId, completion.percentage);
    return toProfileView(record, true);
  };

  return {
    addInterest: (userId, name) => mutateAndGet(userId, () => repository.addInterest(userId, name)),
    addSkill: (userId, input) => mutateAndGet(userId, () => repository.addSkill(userId, input)),
    createAchievement: (userId, input) => {
      if (input.title === undefined)
        throw new Error('Validated achievement input must contain a title.');
      return mutateAndGet(userId, () => repository.createAchievement(userId, input));
    },
    createPortfolioLink: (userId, input) => {
      const { label, url } = input;
      if (label === undefined || url === undefined)
        throw new Error('Validated portfolio input must contain a label and URL.');
      return mutateAndGet(userId, async () => {
        try {
          await repository.createPortfolioLink(userId, {
            label,
            sortOrder: input.sortOrder ?? 0,
            url,
          });
        } catch (error) {
          if (error instanceof PortfolioLinkConflictError)
            throw new AppError({
              code: 'PORTFOLIO_LINK_EXISTS',
              message: 'This portfolio URL is already on your profile.',
              statusCode: 409,
            });
          throw error;
        }
      });
    },
    deleteAchievement: (userId, id) =>
      mutateAndGet(userId, async () => {
        if (!(await repository.deleteAchievement(userId, id))) throw notFound('ACHIEVEMENT');
      }),
    deletePortfolioLink: (userId, id) =>
      mutateAndGet(userId, async () => {
        if (!(await repository.deletePortfolioLink(userId, id))) throw notFound('PORTFOLIO_LINK');
      }),
    getOwnProfile,
    getProfileOptions: () => repository.getOptions(),
    getPublicProfile: async (userId) => toProfileView(await getRecord(userId, true), false),
    removeInterest: (userId, id) =>
      mutateAndGet(userId, async () => {
        if (!(await repository.removeInterest(userId, id))) throw notFound('INTEREST');
      }),
    removeSkill: (userId, id) =>
      mutateAndGet(userId, async () => {
        if (!(await repository.removeSkill(userId, id))) throw notFound('SKILL');
      }),
    updateAchievement: (userId, id, input) =>
      mutateAndGet(userId, async () => {
        if (!(await repository.updateAchievement(userId, id, input))) throw notFound('ACHIEVEMENT');
      }),
    updateOwnProfile: (userId, patch) =>
      mutateAndGet(userId, () => repository.updateProfile(userId, patch)),
    updatePortfolioLink: (userId, id, input) =>
      mutateAndGet(userId, async () => {
        try {
          if (!(await repository.updatePortfolioLink(userId, id, input)))
            throw notFound('PORTFOLIO_LINK');
        } catch (error) {
          if (error instanceof PortfolioLinkConflictError)
            throw new AppError({
              code: 'PORTFOLIO_LINK_EXISTS',
              message: 'This portfolio URL is already on your profile.',
              statusCode: 409,
            });
          throw error;
        }
      }),
    updateSkill: (userId, id, proficiency) =>
      mutateAndGet(userId, async () => {
        if (!(await repository.updateSkill(userId, id, proficiency))) throw notFound('SKILL');
      }),
  };
};

export const profileService = createProfileService();
