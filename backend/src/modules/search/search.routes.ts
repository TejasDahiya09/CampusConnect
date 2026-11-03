import { Router } from 'express';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { searchController } from './search.controller.js';

export const searchRouter = Router();
searchRouter.use(authenticationMiddleware.requireAuth);
searchRouter.get('/', searchController.search);
