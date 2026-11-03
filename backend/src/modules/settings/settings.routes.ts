import { Router } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { settingsController } from './settings.controller.js';

export const settingsRouter = Router();
settingsRouter.use(authenticationMiddleware.requireAuth);
settingsRouter.get('/', settingsController.account);
settingsRouter.post('/deactivate', settingsController.deactivate);
