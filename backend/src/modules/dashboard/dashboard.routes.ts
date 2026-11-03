import { Router } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { dashboardController } from './dashboard.controller.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticationMiddleware.requireAuth);
dashboardRouter.get('/', dashboardController.get);
