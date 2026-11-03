import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { AccountStatus, UserRole } from '../../generated/prisma/client.js';
import { authUserRepository, type AuthUserRepository } from '../auth/auth.repository.js';

const denied = () =>
  new AppError({
    code: 'ADMIN_ACCESS_DENIED',
    message: 'You do not have permission to access administration.',
    statusCode: 403,
  });

export const createDesignatedAdminMiddleware =
  (
    allowedUserId: string | undefined,
    repository: Pick<AuthUserRepository, 'findById'>,
  ): RequestHandler =>
  async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const authenticated = request.auth;
      if (!allowedUserId || !authenticated) throw denied();
      if (
        authenticated.identity.id !== allowedUserId ||
        authenticated.user.id !== allowedUserId ||
        authenticated.identity.id !== authenticated.user.id
      )
        throw denied();

      const current = await repository.findById(allowedUserId);
      if (
        !current ||
        current.id !== authenticated.identity.id ||
        current.role !== UserRole.ADMIN ||
        current.status !== AccountStatus.ACTIVE
      )
        throw denied();
      request.auth = { ...authenticated, user: current };
      next();
    } catch (error) {
      next(error);
    }
  };

export const requireDesignatedAdmin = createDesignatedAdminMiddleware(
  env.adminAllowedUserId,
  authUserRepository,
);
