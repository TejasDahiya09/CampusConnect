import { Router } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { homeController } from './home.controller.js';
export const homeRouter = Router();
homeRouter.use(authenticationMiddleware.requireAuth);
homeRouter.get('/', homeController.get);
