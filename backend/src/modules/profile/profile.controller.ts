import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { profileService, type ProfileService } from './profile.service.js';
import {
  parseAchievementInput,
  parseInterestInput,
  parsePortfolioInput,
  parseProfilePatch,
  parseSkillInput,
  parseSkillPatch,
  parseUuid,
} from './profile.validation.js';
import { analyzeResume as analyzeResumeFile } from './resume-analysis.service.js';
import { validateResumeFile } from './resume-upload.js';

const getAuthenticatedUserId = (request: Parameters<RequestHandler>[0]): string => {
  if (request.auth === undefined) {
    throw new Error('Authentication middleware did not attach an application user.');
  }
  return request.auth.user.id;
};

export const createProfileController = (
  service: ProfileService = profileService,
  resumeAnalyzer: typeof analyzeResumeFile = analyzeResumeFile,
) => ({
  analyzeResume: (async (request, response) => {
    getAuthenticatedUserId(request);
    const file = validateResumeFile(request.file);
    try {
      return sendSuccess(response, await resumeAnalyzer(file.buffer, file.mimetype));
    } finally {
      file.buffer.fill(0);
    }
  }) satisfies RequestHandler,
  addInterest: (async (request, response) => {
    const profile = await service.addInterest(
      getAuthenticatedUserId(request),
      parseInterestInput(request.body).name,
    );
    return sendSuccess(response, { profile }, { statusCode: 201 });
  }) satisfies RequestHandler,

  addSkill: (async (request, response) => {
    const profile = await service.addSkill(
      getAuthenticatedUserId(request),
      parseSkillInput(request.body),
    );
    return sendSuccess(response, { profile }, { statusCode: 201 });
  }) satisfies RequestHandler,

  createAchievement: (async (request, response) => {
    const profile = await service.createAchievement(
      getAuthenticatedUserId(request),
      parseAchievementInput(request.body, false),
    );
    return sendSuccess(response, { profile }, { statusCode: 201 });
  }) satisfies RequestHandler,

  createPortfolioLink: (async (request, response) => {
    const profile = await service.createPortfolioLink(
      getAuthenticatedUserId(request),
      parsePortfolioInput(request.body, false),
    );
    return sendSuccess(response, { profile }, { statusCode: 201 });
  }) satisfies RequestHandler,

  deleteAchievement: (async (request, response) => {
    const profile = await service.deleteAchievement(
      getAuthenticatedUserId(request),
      parseUuid('achievementId', request.params.achievementId),
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  deletePortfolioLink: (async (request, response) => {
    const profile = await service.deletePortfolioLink(
      getAuthenticatedUserId(request),
      parseUuid('portfolioLinkId', request.params.portfolioLinkId),
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  getMe: (async (request, response) => {
    const profile = await service.getOwnProfile(getAuthenticatedUserId(request));
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  getOptions: (async (_request, response) => {
    const options = await service.getProfileOptions();
    return sendSuccess(response, { options });
  }) satisfies RequestHandler,

  getPublic: (async (request, response) => {
    const profile = await service.getPublicProfile(parseUuid('userId', request.params.userId));
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  listAchievements: (async (request, response) => {
    const profile = await service.getOwnProfile(getAuthenticatedUserId(request));
    return sendSuccess(response, { achievements: profile.achievements });
  }) satisfies RequestHandler,

  listInterests: (async (request, response) => {
    const profile = await service.getOwnProfile(getAuthenticatedUserId(request));
    return sendSuccess(response, { interests: profile.interests });
  }) satisfies RequestHandler,

  listPortfolioLinks: (async (request, response) => {
    const profile = await service.getOwnProfile(getAuthenticatedUserId(request));
    return sendSuccess(response, { portfolioLinks: profile.portfolioLinks });
  }) satisfies RequestHandler,

  listSkills: (async (request, response) => {
    const profile = await service.getOwnProfile(getAuthenticatedUserId(request));
    return sendSuccess(response, { skills: profile.skills });
  }) satisfies RequestHandler,

  removeInterest: (async (request, response) => {
    const profile = await service.removeInterest(
      getAuthenticatedUserId(request),
      parseUuid('interestId', request.params.interestId),
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  removeSkill: (async (request, response) => {
    const profile = await service.removeSkill(
      getAuthenticatedUserId(request),
      parseUuid('skillId', request.params.skillId),
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  updateAchievement: (async (request, response) => {
    const profile = await service.updateAchievement(
      getAuthenticatedUserId(request),
      parseUuid('achievementId', request.params.achievementId),
      parseAchievementInput(request.body, true),
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  updateMe: (async (request, response) => {
    const profile = await service.updateOwnProfile(
      getAuthenticatedUserId(request),
      parseProfilePatch(request.body),
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  updatePortfolioLink: (async (request, response) => {
    const profile = await service.updatePortfolioLink(
      getAuthenticatedUserId(request),
      parseUuid('portfolioLinkId', request.params.portfolioLinkId),
      parsePortfolioInput(request.body, true),
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,

  updateSkill: (async (request, response) => {
    const profile = await service.updateSkill(
      getAuthenticatedUserId(request),
      parseUuid('skillId', request.params.skillId),
      parseSkillPatch(request.body).proficiency,
    );
    return sendSuccess(response, { profile });
  }) satisfies RequestHandler,
});

export const profileController = createProfileController();
