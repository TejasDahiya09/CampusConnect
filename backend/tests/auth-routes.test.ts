import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express, { type RequestHandler } from 'express';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createAuthRouter } from '../src/modules/auth/auth.routes.js';
import type { AuthenticatedUser, SupabaseIdentity } from '../src/modules/auth/auth.types.js';
import { withTestServer } from './helpers/test-server.js';

const identity: SupabaseIdentity = {
  email: 'student@university.edu',
  emailVerified: true,
  id: '11111111-1111-4111-8111-111111111111',
  metadata: {},
};

const user: AuthenticatedUser = {
  email: identity.email,
  emailVerifiedAt: new Date(),
  id: identity.id,
  profile: { displayName: 'Student User', id: '22222222-2222-4222-8222-222222222222' },
  role: UserRole.STUDENT,
  status: AccountStatus.ACTIVE,
};

const createApp = (authenticated: boolean) => {
  const app = express();
  app.use(express.json());

  const requireVerifiedIdentity: RequestHandler = (request, response, next) => {
    if (!authenticated) {
      response.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED' }, success: false });
      return;
    }

    request.authIdentity = identity;
    next();
  };
  const requireAuth: RequestHandler = (request, response, next) => {
    if (!authenticated) {
      response.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED' }, success: false });
      return;
    }

    request.auth = { identity, user };
    next();
  };

  app.use(
    '/api/auth',
    createAuthRouter({
      requireAuth,
      requireVerifiedIdentity,
      synchronizeUser: () => Promise.resolve(user),
    }),
  );
  app.use(errorHandler);
  return app;
};

interface AuthResponseBody {
  readonly data: { readonly user: AuthenticatedUser };
  readonly success: true;
}

const readJson = <T>(response: Response): Promise<T> => response.json() as Promise<T>;

void describe('authentication routes', () => {
  void it('rejects unauthenticated /api/auth/me', async () => {
    await withTestServer(createApp(false), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(response.status, 401);
    });
  });

  void it('returns the application user from authenticated /api/auth/me', async () => {
    await withTestServer(createApp(true), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      const body = await readJson<AuthResponseBody>(response);
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.user.id, identity.id);
    });
  });

  void it('synchronizes an authenticated identity', async () => {
    await withTestServer(createApp(true), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/sync`, {
        body: JSON.stringify({ displayName: 'Student User' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.equal((await readJson<AuthResponseBody>(response)).data.user.id, identity.id);
    });
  });
});
