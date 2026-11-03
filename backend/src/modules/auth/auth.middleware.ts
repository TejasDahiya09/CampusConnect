import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../../errors/app-error.js';
import { AccountStatus, type UserRole } from '../../generated/prisma/client.js';
import { authUserRepository, type AuthUserRepository } from './auth.repository.js';
import type { SupabaseIdentity, VerifyAccessToken } from './auth.types.js';
import { verifySupabaseAccessToken } from './supabase-jwt.js';
import { confirmSupabaseEmail } from './supabase-user.js';

interface AuthenticationDependencies {
  readonly confirmEmail?: (
    accessToken: string,
    identity: SupabaseIdentity,
  ) => Promise<SupabaseIdentity>;
  readonly repository: Pick<AuthUserRepository, 'findById'>;
  readonly verifyAccessToken: VerifyAccessToken;
}

const getBearerToken = (request: Request, required: boolean): string | undefined => {
  const authorization = request.get('authorization');

  if (authorization === undefined) {
    if (!required) {
      return undefined;
    }

    throw new AppError({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication is required.',
      statusCode: 401,
    });
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization);

  if (match?.[1] === undefined || match[1].length > 8192) {
    throw new AppError({
      code: 'INVALID_AUTHORIZATION_HEADER',
      message: 'Authorization must use a valid Bearer token.',
      statusCode: 401,
    });
  }

  return match[1];
};

const runMiddleware =
  (handler: (request: Request) => Promise<void>): RequestHandler =>
  (request, _response, next) => {
    void handler(request).then(() => next(), next);
  };

export const createAuthenticationMiddleware = ({
  confirmEmail,
  repository,
  verifyAccessToken,
}: AuthenticationDependencies) => {
  const authenticateIdentity = async (
    request: Request,
    required: boolean,
    requireVerifiedEmail = false,
  ): Promise<boolean> => {
    const token = getBearerToken(request, required);

    if (token === undefined) {
      return false;
    }

    const identity = await verifyAccessToken(token);
    request.authIdentity =
      requireVerifiedEmail && confirmEmail !== undefined
        ? await confirmEmail(token, identity)
        : identity;
    return true;
  };

  const resolveApplicationUser = async (request: Request): Promise<void> => {
    const identity = request.authIdentity;

    if (identity === undefined) {
      throw new AppError({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
        statusCode: 401,
      });
    }

    const user = await repository.findById(identity.id);

    if (user === null) {
      throw new AppError({
        code: 'ACCOUNT_NOT_INITIALIZED',
        message: 'Complete account initialization before continuing.',
        statusCode: 403,
      });
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new AppError({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'This account is not available.',
        statusCode: 403,
      });
    }

    request.auth = { identity, user };
  };

  return {
    optionalAuth: runMiddleware(async (request) => {
      if (await authenticateIdentity(request, false)) {
        await resolveApplicationUser(request);
      }
    }),
    requireAuth: runMiddleware(async (request) => {
      await authenticateIdentity(request, true);
      await resolveApplicationUser(request);
    }),
    requireIdentity: runMiddleware(async (request) => {
      await authenticateIdentity(request, true);
    }),
    requireVerifiedIdentity: runMiddleware(async (request) => {
      if (confirmEmail === undefined) {
        throw new AppError({
          code: 'AUTH_CONFIGURATION_ERROR',
          expose: false,
          message: 'Verified identity resolution is not configured.',
          statusCode: 503,
        });
      }

      await authenticateIdentity(request, true, true);
    }),
  };
};

export const authenticationMiddleware = createAuthenticationMiddleware({
  confirmEmail: confirmSupabaseEmail,
  repository: authUserRepository,
  verifyAccessToken: verifySupabaseAccessToken,
});

export const requireRole =
  (...allowedRoles: readonly UserRole[]): RequestHandler =>
  (request: Request, _response: Response, next: NextFunction) => {
    if (request.auth === undefined) {
      return next(
        new AppError({
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required.',
          statusCode: 401,
        }),
      );
    }

    if (!allowedRoles.includes(request.auth.user.role)) {
      return next(
        new AppError({
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to perform this action.',
          statusCode: 403,
        }),
      );
    }

    return next();
  };
