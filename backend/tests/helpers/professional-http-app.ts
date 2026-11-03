/** Controlled test issuer only. Real Express/auth middleware; never a Supabase verification claim. */
import { randomBytes } from 'node:crypto';
import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '../../src/errors/app-error.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/error-handler.js';
import { createAuthenticationMiddleware } from '../../src/modules/auth/auth.middleware.js';
import type { AuthUserRepository } from '../../src/modules/auth/auth.repository.js';
import {
  createProfessionalRouter,
  type ProfessionalStore,
} from '../../src/modules/profile/professional-profile.js';
import { createProfileRouter } from '../../src/modules/profile/profile.routes.js';
import { createProfileController } from '../../src/modules/profile/profile.controller.js';
import { createProfileService } from '../../src/modules/profile/profile.service.js';
import {
  profileRepository,
  type ProfileRepository,
} from '../../src/modules/profile/profile.repository.js';

export function createProfessionalHttpFixture(options: {
  readonly users: Pick<AuthUserRepository, 'findById'>;
  readonly store: ProfessionalStore;
  readonly profiles: Pick<ProfileRepository, 'findByUserId'>;
  readonly ready?: boolean;
}) {
  const key = randomBytes(32);
  const issuer = 'campusconnect-isolated-professional-test';
  const audience = 'professional-http-only';
  const auth = createAuthenticationMiddleware({
    repository: options.users,
    verifyAccessToken: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer,
          audience,
          algorithms: ['HS256'],
        });
        if (typeof payload.sub !== 'string') throw new Error('Missing test subject');
        return {
          id: payload.sub,
          email: 'synthetic@example.test',
          emailVerified: true,
          metadata: {},
        };
      } catch {
        throw new AppError({
          code: 'TEST_TOKEN_INVALID',
          message: 'Authentication is invalid.',
          statusCode: 401,
        });
      }
    },
  });
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    '/api/profile/me/professional',
    createProfessionalRouter(options.ready ?? true, options.store, auth.requireAuth),
  );
  app.use(
    '/api/profile',
    createProfileRouter({
      controller: createProfileController(
        createProfileService({ ...profileRepository, ...options.profiles }),
      ),
      requireAuth: auth.requireAuth,
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return {
    app,
    token: (userId: string) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key),
  };
}
