import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { AppError } from '../src/errors/app-error.js';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import {
  createAuthenticationMiddleware,
  requireRole,
} from '../src/modules/auth/auth.middleware.js';
import type {
  AuthenticatedUser,
  SupabaseIdentity,
  VerifyAccessToken,
} from '../src/modules/auth/auth.types.js';
import { withTestServer } from './helpers/test-server.js';

const identity: SupabaseIdentity = {
  email: 'student@university.edu',
  emailVerified: true,
  id: '11111111-1111-4111-8111-111111111111',
  metadata: {},
};

const createUser = (role: UserRole): AuthenticatedUser => ({
  email: identity.email,
  emailVerifiedAt: new Date(),
  id: identity.id,
  profile: { displayName: 'Student User', id: '22222222-2222-4222-8222-222222222222' },
  role,
  status: AccountStatus.ACTIVE,
});

const createTestApp = (
  verifyAccessToken: VerifyAccessToken,
  user: AuthenticatedUser | null,
  allowedRoles?: readonly UserRole[],
) => {
  const app = express();
  const middleware = createAuthenticationMiddleware({
    repository: { findById: () => Promise.resolve(user) },
    verifyAccessToken,
  });

  app.get(
    '/protected',
    middleware.requireAuth,
    ...(allowedRoles === undefined ? [] : [requireRole(...allowedRoles)]),
    (request, response) => response.json({ role: request.auth?.user.role }),
  );
  app.use(errorHandler);
  return app;
};

interface ErrorBody {
  readonly error: { readonly code: string };
}

interface RoleBody {
  readonly role: UserRole;
}

const readJson = <T>(response: Response): Promise<T> => response.json() as Promise<T>;

void describe('authentication middleware', () => {
  void it('rejects a missing token', async () => {
    const app = createTestApp(() => Promise.resolve(identity), createUser(UserRole.STUDENT));

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/protected`);
      assert.equal(response.status, 401);
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'AUTHENTICATION_REQUIRED');
    });
  });

  void it('rejects a malformed authorization header', async () => {
    const app = createTestApp(() => Promise.resolve(identity), createUser(UserRole.STUDENT));

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: 'Token malformed' },
      });
      assert.equal(response.status, 401);
      assert.equal(
        (await readJson<ErrorBody>(response)).error.code,
        'INVALID_AUTHORIZATION_HEADER',
      );
    });
  });

  void it('rejects an invalid token', async () => {
    const app = createTestApp(
      () =>
        Promise.reject(
          new AppError({
            code: 'INVALID_ACCESS_TOKEN',
            message: 'The access token is invalid or expired.',
            statusCode: 401,
          }),
        ),
      createUser(UserRole.STUDENT),
    );

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: 'Bearer invalid-token' },
      });
      assert.equal(response.status, 401);
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'INVALID_ACCESS_TOKEN');
    });
  });

  void it('accepts an authenticated request', async () => {
    const app = createTestApp(() => Promise.resolve(identity), createUser(UserRole.STUDENT));

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: 'Bearer valid-token' },
      });
      assert.equal(response.status, 200);
      assert.equal((await readJson<RoleBody>(response)).role, UserRole.STUDENT);
    });
  });

  void it('rejects a suspended application user', async () => {
    const user = { ...createUser(UserRole.STUDENT), status: AccountStatus.SUSPENDED };
    const app = createTestApp(() => Promise.resolve(identity), user);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: 'Bearer valid-token' },
      });
      assert.equal(response.status, 403);
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'ACCOUNT_UNAVAILABLE');
    });
  });

  void it('rejects a deactivated application user', async () => {
    const user = { ...createUser(UserRole.STUDENT), status: AccountStatus.DEACTIVATED };
    const app = createTestApp(() => Promise.resolve(identity), user);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: 'Bearer valid-token' },
      });
      assert.equal(response.status, 403);
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'ACCOUNT_UNAVAILABLE');
    });
  });

  for (const role of [UserRole.STUDENT, UserRole.MODERATOR, UserRole.ADMIN]) {
    void it(`allows the ${role} role when explicitly permitted`, async () => {
      const app = createTestApp(() => Promise.resolve(identity), createUser(role), [role]);

      await withTestServer(app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/protected`, {
          headers: { authorization: 'Bearer valid-token' },
        });
        assert.equal(response.status, 200);
      });
    });
  }

  void it('forbids a role that is not permitted', async () => {
    const app = createTestApp(() => Promise.resolve(identity), createUser(UserRole.STUDENT), [
      UserRole.ADMIN,
    ]);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { authorization: 'Bearer valid-token' },
      });
      assert.equal(response.status, 403);
      assert.equal((await readJson<ErrorBody>(response)).error.code, 'INSUFFICIENT_PERMISSIONS');
    });
  });
});
