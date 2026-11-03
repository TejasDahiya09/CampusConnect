import { apiRequest } from '../../services/api-client';
import type { ProfileOptions, StudentProfile, ProfilePatch } from './profile.types';
import type { ResumeAnalysis } from './resume-analysis.types';

interface ProfileResponse {
  readonly profile: StudentProfile;
}

const profileMutation = (
  path: string,
  method: 'DELETE' | 'PATCH' | 'POST',
  body?: unknown,
): Promise<ProfileResponse> =>
  apiRequest<ProfileResponse>(path, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    method,
  });

export const getMyProfile = async (): Promise<StudentProfile> =>
  (await apiRequest<ProfileResponse>('/api/profile/me')).profile;

export const getPublicProfile = async (userId: string): Promise<StudentProfile> =>
  (await apiRequest<ProfileResponse>(`/api/profile/${encodeURIComponent(userId)}`)).profile;

export const getProfileOptions = async (): Promise<ProfileOptions> =>
  (await apiRequest<{ readonly options: ProfileOptions }>('/api/profile/options')).options;

export const analyzeResume = async (file: File): Promise<ResumeAnalysis> => {
  const body = new FormData();
  body.append('resume', file);
  return apiRequest<ResumeAnalysis>('/api/profile/resume/analyze', { body, method: 'POST' });
};

export const updateMyProfile = async (patch: ProfilePatch): Promise<StudentProfile> =>
  (await profileMutation('/api/profile/me', 'PATCH', patch)).profile;

export const addSkill = async (name: string, proficiency: number | null) =>
  (await profileMutation('/api/profile/me/skills', 'POST', { name, proficiency })).profile;

export const updateSkill = async (skillId: string, proficiency: number | null) =>
  (
    await profileMutation(`/api/profile/me/skills/${encodeURIComponent(skillId)}`, 'PATCH', {
      proficiency,
    })
  ).profile;

export const removeSkill = async (skillId: string) =>
  (await profileMutation(`/api/profile/me/skills/${encodeURIComponent(skillId)}`, 'DELETE'))
    .profile;

export const addInterest = async (name: string) =>
  (await profileMutation('/api/profile/me/interests', 'POST', { name })).profile;

export const removeInterest = async (interestId: string) =>
  (await profileMutation(`/api/profile/me/interests/${encodeURIComponent(interestId)}`, 'DELETE'))
    .profile;

export const createAchievement = async (input: {
  readonly awardedAt: string | null;
  readonly description: string | null;
  readonly title: string;
}) => (await profileMutation('/api/profile/me/achievements', 'POST', input)).profile;

export const updateAchievement = async (
  achievementId: string,
  input: {
    readonly awardedAt: string | null;
    readonly description: string | null;
    readonly title: string;
  },
) =>
  (
    await profileMutation(
      `/api/profile/me/achievements/${encodeURIComponent(achievementId)}`,
      'PATCH',
      input,
    )
  ).profile;

export const deleteAchievement = async (achievementId: string) =>
  (
    await profileMutation(
      `/api/profile/me/achievements/${encodeURIComponent(achievementId)}`,
      'DELETE',
    )
  ).profile;

export const createPortfolioLink = async (input: {
  readonly label: string;
  readonly sortOrder: number;
  readonly url: string;
}) => (await profileMutation('/api/profile/me/portfolio-links', 'POST', input)).profile;

export const updatePortfolioLink = async (
  portfolioLinkId: string,
  input: { readonly label: string; readonly sortOrder: number; readonly url: string },
) =>
  (
    await profileMutation(
      `/api/profile/me/portfolio-links/${encodeURIComponent(portfolioLinkId)}`,
      'PATCH',
      input,
    )
  ).profile;

export const deletePortfolioLink = async (portfolioLinkId: string) =>
  (
    await profileMutation(
      `/api/profile/me/portfolio-links/${encodeURIComponent(portfolioLinkId)}`,
      'DELETE',
    )
  ).profile;
