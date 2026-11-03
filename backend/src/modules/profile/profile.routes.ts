import { Router, type RequestHandler } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { profileController } from './profile.controller.js';
import { resumeRateLimitMiddleware, resumeUploadMiddleware } from './resume-upload.js';

interface ProfileRouterDependencies {
  readonly controller: typeof profileController;
  readonly requireAuth: RequestHandler;
}

export const createProfileRouter = ({ controller, requireAuth }: ProfileRouterDependencies) => {
  const router = Router();

  router.get('/me', requireAuth, controller.getMe);
  router.patch('/me', requireAuth, controller.updateMe);
  router.get('/options', requireAuth, controller.getOptions);
  router.post(
    '/resume/analyze',
    requireAuth,
    resumeRateLimitMiddleware,
    resumeUploadMiddleware,
    controller.analyzeResume,
  );

  router.get('/me/skills', requireAuth, controller.listSkills);
  router.post('/me/skills', requireAuth, controller.addSkill);
  router.patch('/me/skills/:skillId', requireAuth, controller.updateSkill);
  router.delete('/me/skills/:skillId', requireAuth, controller.removeSkill);

  router.get('/me/interests', requireAuth, controller.listInterests);
  router.post('/me/interests', requireAuth, controller.addInterest);
  router.delete('/me/interests/:interestId', requireAuth, controller.removeInterest);

  router.get('/me/achievements', requireAuth, controller.listAchievements);
  router.post('/me/achievements', requireAuth, controller.createAchievement);
  router.patch('/me/achievements/:achievementId', requireAuth, controller.updateAchievement);
  router.delete('/me/achievements/:achievementId', requireAuth, controller.deleteAchievement);

  router.get('/me/portfolio-links', requireAuth, controller.listPortfolioLinks);
  router.post('/me/portfolio-links', requireAuth, controller.createPortfolioLink);
  router.patch('/me/portfolio-links/:portfolioLinkId', requireAuth, controller.updatePortfolioLink);
  router.delete(
    '/me/portfolio-links/:portfolioLinkId',
    requireAuth,
    controller.deletePortfolioLink,
  );

  router.get('/:userId', controller.getPublic);

  return router;
};

export const profileRouter = createProfileRouter({
  controller: profileController,
  requireAuth: authenticationMiddleware.requireAuth,
});
