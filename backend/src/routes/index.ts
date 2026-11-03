import { Router } from 'express';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { homeRouter } from '../modules/home/home.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { marketplaceRouter } from '../modules/marketplace/marketplace.routes.js';
import { lostFoundRouter } from '../modules/lost-found/lost-found.routes.js';
import { professionalProfileRouter } from '../modules/profile/professional-profile.js';
import { profilePhotoRouter } from '../modules/profile/profile-photo.js';
import { profileRouter } from '../modules/profile/profile.routes.js';
import { teamUpRouter } from '../modules/teamup/teamup.routes.js';
import { servicesRouter } from '../modules/services/services.routes.js';
import { messagingRouter } from '../modules/messaging/messaging.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { searchRouter } from '../modules/search/search.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { assistantRouter } from '../modules/assistant/assistant.routes.js';
import { studentsRouter } from '../modules/students/students.routes.js';
import { moderationRouter } from '../modules/moderation/moderation.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { publicRouter } from '../modules/public/public.routes.js';
import { sendSuccess } from '../utils/api-response.js';

export const apiRouter = Router();

apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/home', homeRouter);

apiRouter.get('/', (_request, response) => {
  sendSuccess(response, {
    name: 'CampusConnect API',
    version: '0.1.0',
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/marketplace', marketplaceRouter);
apiRouter.use('/lost-found', lostFoundRouter);
apiRouter.use('/profile/me/professional', professionalProfileRouter);
apiRouter.use('/profile/me/photo', profilePhotoRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/teamup', teamUpRouter);
apiRouter.use('/services', servicesRouter);
apiRouter.use('/messages', messagingRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/assistant', assistantRouter);
apiRouter.use('/students', studentsRouter);
apiRouter.use('/moderation', moderationRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/public', publicRouter);
