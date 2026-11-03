import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express, { type RequestHandler } from 'express';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createProfileController } from '../src/modules/profile/profile.controller.js';
import { createProfileRouter } from '../src/modules/profile/profile.routes.js';
import type { ProfileService } from '../src/modules/profile/profile.service.js';
import type { ProfileView } from '../src/modules/profile/profile.types.js';
import type { RequestAuthentication } from '../src/modules/auth/auth.types.js';
import { withTestServer } from './helpers/test-server.js';
import type { ResumeAnalysis } from '../src/modules/profile/resume-analysis.types.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const publicUserId = '33333333-3333-4333-8333-333333333333';

const profile: ProfileView = {
  achievements: [],
  avatar: null,
  bio: 'Student profile',
  completion: {
    completed: 3,
    criteria: {
      achievement: false,
      avatar: false,
      bio: true,
      department: false,
      displayName: true,
      interest: false,
      portfolioLink: false,
      skill: false,
      universityVerified: true,
      year: false,
    },
    percentage: 30,
    total: 10,
  },
  department: null,
  departmentId: null,
  displayName: 'Student User',
  interests: [],
  location: null,
  portfolioLinks: [],
  profileId: '22222222-2222-4222-8222-222222222222',
  skills: [],
  universityDomain: 'university.edu',
  userId: ownerId,
  year: null,
};

const publicProfile = (() => {
  const { completion: _completion, ...visibleProfile } = profile;
  return visibleProfile;
})();

const createService = (overrides: Partial<ProfileService> = {}): ProfileService => ({
  addInterest: () => Promise.resolve(profile),
  addSkill: () => Promise.resolve(profile),
  createAchievement: () => Promise.resolve(profile),
  createPortfolioLink: () => Promise.resolve(profile),
  deleteAchievement: () => Promise.resolve(profile),
  deletePortfolioLink: () => Promise.resolve(profile),
  getOwnProfile: () => Promise.resolve(profile),
  getProfileOptions: () => Promise.resolve({ departments: [], interests: [], skills: [] }),
  getPublicProfile: () => Promise.resolve(publicProfile),
  removeInterest: () => Promise.resolve(profile),
  removeSkill: () => Promise.resolve(profile),
  updateAchievement: () => Promise.resolve(profile),
  updateOwnProfile: () => Promise.resolve(profile),
  updatePortfolioLink: () => Promise.resolve(profile),
  updateSkill: () => Promise.resolve(profile),
  ...overrides,
});

const authentication: RequestAuthentication = {
  identity: { email: 'student@university.edu', emailVerified: true, id: ownerId, metadata: {} },
  user: {
    email: 'student@university.edu',
    emailVerifiedAt: new Date(),
    id: ownerId,
    profile: { displayName: 'Student User', id: profile.profileId },
    role: UserRole.STUDENT,
    status: AccountStatus.ACTIVE,
  },
};

const createApp = (
  authenticated: boolean,
  service: ProfileService,
  resumeAnalyzer: (content: Buffer, mediaType: string) => Promise<ResumeAnalysis> = () =>
    Promise.resolve({ skills: [], status: 'completed' }),
) => {
  const app = express();
  app.use(express.json());
  const requireAuth: RequestHandler = (request, response, next) => {
    if (!authenticated) {
      response.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED' }, success: false });
      return;
    }
    request.auth = authentication;
    next();
  };
  app.use(
    '/api/profile',
    createProfileRouter({
      controller: createProfileController(service, resumeAnalyzer),
      requireAuth,
    }),
  );
  app.use(errorHandler);
  return app;
};

interface ProfileResponseBody {
  readonly data: { readonly profile: ProfileView };
  readonly success: true;
}

interface ErrorResponseBody {
  readonly error: { readonly code: string };
  readonly success: false;
}

const readJson = <T>(response: Response): Promise<T> => response.json() as Promise<T>;

void describe('profile routes', () => {
  void it('rejects unauthenticated resume uploads before analysis', async () => {
    let called = false;
    await withTestServer(
      createApp(false, createService(), () => {
        called = true;
        return Promise.resolve({ skills: [], status: 'completed' });
      }),
      async (baseUrl) => {
        const body = new FormData();
        body.append('resume', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'resume.pdf');
        const response = await fetch(`${baseUrl}/api/profile/resume/analyze`, {
          body,
          method: 'POST',
        });
        assert.equal(response.status, 401);
        assert.equal(called, false);
      },
    );
  });

  void it('validates and forwards an authenticated resume without persistence', async () => {
    let received: { mediaType: string; signature: string } | undefined;
    await withTestServer(
      createApp(true, createService(), (content, mediaType) => {
        received = { mediaType, signature: content.subarray(0, 5).toString() };
        return Promise.resolve({
          skills: [
            {
              category: 'Programming Languages',
              confidence: 'high',
              evidence: 'Used Python',
              method: 'explicit_mention',
              name: 'Python',
            },
          ],
          status: 'completed',
        });
      }),
      async (baseUrl) => {
        const body = new FormData();
        body.append('resume', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'resume.pdf');
        const response = await fetch(`${baseUrl}/api/profile/resume/analyze`, {
          body,
          method: 'POST',
        });
        assert.equal(response.status, 200);
        assert.deepEqual(received, { mediaType: 'application/pdf', signature: '%PDF-' });
        assert.doesNotMatch(await response.text(), /resume text|email|phone/i);
      },
    );
  });

  void it('rejects a MIME and signature mismatch before analysis', async () => {
    await withTestServer(createApp(true, createService()), async (baseUrl) => {
      const body = new FormData();
      body.append('resume', new Blob(['not a pdf'], { type: 'application/pdf' }), 'resume.pdf');
      const response = await fetch(`${baseUrl}/api/profile/resume/analyze`, {
        body,
        method: 'POST',
      });
      const result = await readJson<ErrorResponseBody>(response);
      assert.equal(response.status, 415);
      assert.equal(result.error.code, 'RESUME_UNSUPPORTED');
    });
  });

  void it('rejects unauthenticated GET /profile/me', async () => {
    await withTestServer(createApp(false, createService()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profile/me`);
      assert.equal(response.status, 401);
    });
  });

  void it('returns authenticated GET /profile/me', async () => {
    await withTestServer(createApp(true, createService()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profile/me`);
      const body = await readJson<ProfileResponseBody>(response);
      assert.equal(response.status, 200);
      assert.equal(body.data.profile.userId, ownerId);
    });
  });

  void it('updates only the authenticated user through PATCH /profile/me', async () => {
    let updatedUserId: string | undefined;
    const service = createService({
      updateOwnProfile: (userId) => {
        updatedUserId = userId;
        return Promise.resolve(profile);
      },
    });

    await withTestServer(createApp(true, service), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profile/me`, {
        body: JSON.stringify({ displayName: 'Updated Student' }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      assert.equal(response.status, 200);
      assert.equal(updatedUserId, ownerId);
    });
  });

  void it('rejects invalid or security-sensitive profile fields', async () => {
    await withTestServer(createApp(true, createService()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profile/me`, {
        body: JSON.stringify({ role: 'ADMIN' }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const body = await readJson<ErrorResponseBody>(response);
      assert.equal(response.status, 400);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    });
  });

  void it('retrieves a public profile without authentication or private fields', async () => {
    const service = createService({
      getPublicProfile: (userId) => Promise.resolve({ ...publicProfile, userId }),
    });

    await withTestServer(createApp(false, service), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/profile/${publicUserId}`);
      const body = await readJson<ProfileResponseBody>(response);
      assert.equal(response.status, 200);
      assert.equal(body.data.profile.userId, publicUserId);
      assert.equal('email' in body.data.profile, false);
      assert.equal('role' in body.data.profile, false);
      assert.equal('status' in body.data.profile, false);
    });
  });
});
