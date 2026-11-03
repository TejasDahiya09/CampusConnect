/* eslint @typescript-eslint/require-await: off -- In-memory repository adapters; no database or external requests. */
import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import {
  createProfessionalRouter,
  parseProfessionalDetails,
  professionalVersion,
} from '../src/modules/profile/professional-profile.js';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { AppError } from '../src/errors/app-error.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { withTestServer } from './helpers/test-server.js';
const details = {
  headline: 'Student developer',
  education: [{ institution: 'Synthetic College', qualification: 'Computing' }],
  experience: [
    {
      role: 'Project contributor',
      organization: 'Synthetic team',
      description: 'Student-supplied text.',
    },
  ],
};
void test('professional details preserve bounded student text and support explicit clearing', () => {
  assert.deepEqual(parseProfessionalDetails(details), details);
  assert.deepEqual(parseProfessionalDetails({ headline: null, education: [], experience: [] }), {
    headline: null,
    education: [],
    experience: [],
  });
  assert.equal(
    parseProfessionalDetails({ ...details, headline: ' <script>text</script> ' }).headline,
    '<script>text</script>',
  );
});
void test('professional validation rejects unknown fields, spoofed ownership and oversized entries', () => {
  for (const value of [
    { ...details, userId: 'other' },
    { ...details, photoUrl: 'https://untrusted.test/image' },
    { ...details, headline: 'x'.repeat(181) },
    { ...details, education: Array(6).fill(details.education[0]) },
    { ...details, experience: [{ ...details.experience[0], description: 'x'.repeat(1001) }] },
    { ...details, education: [{ institution: '', qualification: '' }] },
    { ...details, experience: [{ role: '', organization: '', description: '' }] },
    { headline: null },
  ])
    assert.throws(() => parseProfessionalDetails(value));
});
const owner = '11111111-1111-4111-8111-111111111111';
const auth: RequestHandler = (req, _res, next) => {
  const token = req.get('authorization');
  if (!token)
    return next(new AppError({ code: 'AUTH_REQUIRED', message: 'Sign in.', statusCode: 401 }));
  req.auth = {
    identity: { id: owner, email: 'fixture@example.test', emailVerified: true, metadata: {} },
    user: {
      id: owner,
      email: 'fixture@example.test',
      emailVerifiedAt: new Date(),
      role: UserRole.STUDENT,
      status: token === 'suspended' ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE,
      profile: null,
    },
  };
  next();
};
void test('professional versions are canonical, document-specific and cover explicit empty state', () => {
  assert.equal(
    professionalVersion(details),
    professionalVersion({
      experience: details.experience,
      education: details.education,
      headline: details.headline,
    }),
  );
  assert.notEqual(
    professionalVersion(null),
    professionalVersion({ headline: null, education: [], experience: [] }),
  );
  assert.notEqual(
    professionalVersion(details),
    professionalVersion({ ...details, headline: 'Changed' }),
  );
});
void test('conditional professional writes reject missing versions and stale saves without success', async () => {
  let writes = 0;
  const app = express();
  app.use(express.json());
  app.use(
    '/professional',
    createProfessionalRouter(
      true,
      {
        read: () => Promise.resolve(details),
        write: () => {
          writes++;
          return Promise.resolve('conflict');
        },
      },
      auth,
    ),
  );
  app.use(errorHandler);
  await withTestServer(app, async (base) => {
    const headers = { authorization: 'owner', 'content-type': 'application/json' };
    assert.equal(
      (
        await fetch(base + '/professional', {
          method: 'PUT',
          headers,
          body: JSON.stringify(details),
        })
      ).status,
      428,
    );
    assert.equal(writes, 0);
    assert.equal(
      (
        await fetch(base + '/professional', {
          method: 'PUT',
          headers: { ...headers, 'if-match': 'bad' },
          body: JSON.stringify(details),
        })
      ).status,
      400,
    );
    assert.equal(writes, 0);
    const read = await fetch(base + '/professional', { headers });
    const body = (await read.json()) as { data: { professional: { version: string } } };
    assert.equal(body.data.professional.version, professionalVersion(details));
    assert.equal(
      (
        await fetch(base + '/professional', {
          method: 'PUT',
          headers: { ...headers, 'if-match': `"${body.data.professional.version}"` },
          body: JSON.stringify(details),
        })
      ).status,
      409,
    );
    assert.equal(writes, 1);
  });
});
void test('professional storage failures do not log or return arbitrary private database error text', async () => {
  const secret = 'SYNTHETIC_PRIVATE_EDUCATION_FAILURE';
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const app = express();
    app.use(express.json());
    app.use(
      '/professional',
      createProfessionalRouter(
        true,
        {
          read: () => Promise.reject(new Error(secret)),
          write: () => Promise.reject(new Error(secret)),
        },
        auth,
      ),
    );
    app.use(errorHandler);
    await withTestServer(app, async (base) => {
      for (const method of ['GET', 'PUT']) {
        const response = await fetch(base + '/professional', {
          method,
          headers: {
            authorization: 'owner',
            'content-type': 'application/json',
            'if-match': `"${professionalVersion(null)}"`,
          },
          ...(method === 'PUT' ? { body: JSON.stringify(details) } : {}),
        });
        assert.equal(response.status, 503);
        assert.ok(!(await response.text()).includes(secret));
      }
    });
    assert.ok(!JSON.stringify(logged).includes(secret));
  } finally {
    console.error = original;
  }
});
void test('pending professional storage never queries or writes the database', async () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/professional',
    createProfessionalRouter(
      false,
      {
        read: async () => {
          throw new Error('Database must not be read');
        },
        write: async () => {
          throw new Error('Database must not be written');
        },
      },
      auth,
    ),
  );
  app.use(errorHandler);
  await withTestServer(app, async (base) => {
    const response = await fetch(base + '/professional', { headers: { authorization: 'owner' } });
    assert.deepEqual(
      ((await response.json()) as { data: { professional: unknown } }).data.professional,
      { available: false, details: null, version: null },
    );
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(
      (
        await fetch(base + '/professional', {
          method: 'PUT',
          headers: { authorization: 'owner', 'content-type': 'application/json' },
          body: JSON.stringify(details),
        })
      ).status,
      503,
    );
  });
});
void test('professional endpoints enforce active authenticated owner and strip arbitrary DTO fields', async () => {
  let stored: unknown = { ...details, privateEmail: 'never-return' },
    writtenOwner = '';
  const app = express();
  app.use(express.json());
  app.use(
    '/professional',
    createProfessionalRouter(
      true,
      {
        read: async (id) => {
          assert.equal(id, owner);
          return stored;
        },
        write: async (id, input) => {
          writtenOwner = id;
          stored = input;
          return true;
        },
      },
      auth,
    ),
  );
  app.use(errorHandler);
  await withTestServer(app, async (base) => {
    assert.equal((await fetch(base + '/professional')).status, 401);
    assert.equal(
      (await fetch(base + '/professional', { headers: { authorization: 'suspended' } })).status,
      403,
    );
    // Unknown persisted fields fail closed rather than leaking internal/personal data.
    assert.equal(
      (await fetch(base + '/professional', { headers: { authorization: 'owner' } })).status,
      400,
    );
    stored = details;
    const response = await fetch(base + '/professional', {
      method: 'PUT',
      headers: {
        authorization: 'owner',
        'content-type': 'application/json',
        'if-match': `"${professionalVersion(details)}"`,
      },
      body: JSON.stringify(details),
    });
    assert.equal(response.status, 200);
    assert.equal(writtenOwner, owner);
    const result = await response.text();
    assert.ok(result.includes('Student developer'));
    assert.ok(!result.includes('privateEmail'));
    assert.equal(
      (
        await fetch(base + '/professional', {
          method: 'PUT',
          headers: { authorization: 'owner', 'content-type': 'application/json' },
          body: JSON.stringify({ ...details, userId: 'other' }),
        })
      ).status,
      400,
    );
  });
});
