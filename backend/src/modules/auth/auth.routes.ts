import { Router, type RequestHandler } from 'express';
import { ValidationError } from '../../errors/app-error.js';
import { sendSuccess } from '../../utils/api-response.js';
import { authenticationMiddleware } from './auth.middleware.js';
import { synchronizeAuthenticatedUser, type SyncUserRequest } from './auth.service.js';
import type { AuthenticatedUser, SupabaseIdentity } from './auth.types.js';

interface AuthRouterDependencies {
  readonly requireAuth: RequestHandler;
  readonly requireVerifiedIdentity: RequestHandler;
  readonly synchronizeUser: (
    identity: SupabaseIdentity,
    input: SyncUserRequest,
  ) => Promise<AuthenticatedUser>;
}

const parseSyncBody = (body: unknown): SyncUserRequest => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('The request body must be a JSON object.', [
      { field: 'body', message: 'Expected a JSON object.' },
    ]);
  }

  const { displayName } = body as Record<string, unknown>;
  return displayName === undefined ? {} : { displayName };
};

export const createAuthRouter = ({
  requireAuth,
  requireVerifiedIdentity,
  synchronizeUser,
}: AuthRouterDependencies): Router => {
  const router = Router();

  router.post('/sync', requireVerifiedIdentity, async (request, response) => {
    const identity = request.authIdentity;

    if (identity === undefined) {
      throw new Error('Authentication middleware did not attach an identity.');
    }

    const user = await synchronizeUser(identity, parseSyncBody(request.body));
    return sendSuccess(response, { user });
  });

  router.get('/me', requireAuth, (request, response) => {
    if (request.auth === undefined) {
      throw new Error('Authentication middleware did not attach an application user.');
    }

    return sendSuccess(response, { user: request.auth.user });
  });

  return router;
};

export const authRouter = createAuthRouter({
  requireAuth: authenticationMiddleware.requireAuth,
  requireVerifiedIdentity: authenticationMiddleware.requireVerifiedIdentity,
  synchronizeUser: synchronizeAuthenticatedUser,
});
