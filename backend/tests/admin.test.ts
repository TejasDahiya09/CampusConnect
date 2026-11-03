import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createDesignatedAdminMiddleware } from '../src/modules/admin/admin.middleware.js';
import { parseAdminAllowedUserId } from '../src/config/env.js';
import {
  parseAccountDecision,
  parseAdminContentQuery,
  parseAdminUserQuery,
  parseEnforcementDecision,
  parseEnforcementTargetType,
} from '../src/modules/admin/admin.validation.js';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types.js';
import { withTestServer } from './helpers/test-server.js';

const allowedId = '123e4567-e89b-42d3-a456-426614174000';
const otherId = '223e4567-e89b-42d3-a456-426614174000';
const user = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  email: 'admin@example.test',
  emailVerifiedAt: new Date(),
  id: allowedId,
  profile: { displayName: 'Administrator', id: allowedId },
  role: UserRole.ADMIN,
  status: AccountStatus.ACTIVE,
  ...overrides,
});
const responseStatus = async (
  configuredId: string | undefined,
  attached: AuthenticatedUser,
  current: AuthenticatedUser | null,
) => {
  const app = express();
  const attach: RequestHandler = (request, _response, next) => {
    request.auth = {
      identity: {
        email: attached.email,
        emailVerified: true,
        id: attached.id,
        metadata: {},
      },
      user: attached,
    };
    next();
  };
  app.get(
    '/admin',
    attach,
    createDesignatedAdminMiddleware(configuredId, { findById: () => Promise.resolve(current) }),
    (_request, response) => response.sendStatus(204),
  );
  app.use(errorHandler);
  return withTestServer(app, async (baseUrl) => (await fetch(`${baseUrl}/admin`)).status);
};

void test('admin allowlist parsing accepts only a real UUID', () => {
  assert.equal(parseAdminAllowedUserId(allowedId), allowedId);
  assert.equal(parseAdminAllowedUserId('not-a-uuid'), undefined);
  assert.equal(parseAdminAllowedUserId(undefined), undefined);
});
void test('missing and invalid allowlists deny access', async () => {
  assert.equal(await responseStatus(undefined, user(), user()), 403);
  assert.equal(await responseStatus(parseAdminAllowedUserId('invalid'), user(), user()), 403);
});
void test('identity, current database role, and current status are all rechecked', async () => {
  assert.equal(await responseStatus(allowedId, user({ id: otherId }), user()), 403);
  assert.equal(await responseStatus(allowedId, user(), user({ role: UserRole.STUDENT })), 403);
  assert.equal(
    await responseStatus(allowedId, user(), user({ status: AccountStatus.SUSPENDED })),
    403,
  );
  assert.equal(await responseStatus(allowedId, user({ role: UserRole.STUDENT }), user()), 204);
  assert.equal(await responseStatus(allowedId, user(), user()), 204);
});
void test('admin validation bounds pagination, filters, statuses, and mutation reasons', () => {
  assert.equal(parseAdminUserQuery({ limit: '20', page: '1', role: 'STUDENT' }).role, 'STUDENT');
  assert.throws(() => parseAdminUserQuery({ limit: '100' }));
  assert.equal(parseAdminContentQuery({ type: 'MARKETPLACE', status: 'ACTIVE' }).status, 'ACTIVE');
  assert.equal(
    parseAdminContentQuery({ type: 'MARKETPLACE', visibility: 'HIDDEN' }).visibility,
    'HIDDEN',
  );
  assert.throws(() => parseAdminContentQuery({ type: 'MARKETPLACE', status: 'RESOLVED' }));
  assert.equal(
    parseAccountDecision({ reason: 'Repeated abuse', status: 'SUSPENDED' }).status,
    'SUSPENDED',
  );
  assert.throws(() => parseAccountDecision({ reason: '', status: 'SUSPENDED' }));
  assert.equal(parseEnforcementTargetType('PROFILE'), 'PROFILE');
  assert.equal(
    parseEnforcementDecision({ reason: 'Policy violation' }, 'HIDDEN').visibility,
    'HIDDEN',
  );
  assert.throws(() => parseEnforcementDecision({ reason: '' }, 'HIDDEN'));
  assert.throws(() => parseEnforcementTargetType('MESSAGE'));
});
void test('content enforcement is additive, reversible, audited, and leaves lifecycle status unchanged', async () => {
  const [schema, migration, repository, routes] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../prisma/migrations/20261024010000_content_moderation_visibility/migration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('../src/modules/admin/admin.repository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/admin/admin.routes.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(schema, /enum ModerationVisibility/u);
  assert.equal((schema.match(/moderationVisibility ModerationVisibility/gmu) ?? []).length, 5);
  assert.match(migration, /DEFAULT 'VISIBLE'/u);
  assert.equal((migration.match(/ADD COLUMN "moderation_visibility"/gmu) ?? []).length, 5);
  assert.match(repository, /ADMIN_CONTENT_HIDDEN/u);
  assert.match(repository, /ADMIN_CONTENT_RESTORED/u);
  assert.match(repository, /previousVisibility/u);
  assert.match(repository, /businessStatus/u);
  assert.match(routes, /content\/:type\/:id\/hide/u);
  assert.match(routes, /content\/:type\/:id\/restore/u);
});
void test('admin implementation preserves privacy, auditability, and schema boundaries', async () => {
  const [repository, service, routes] = await Promise.all([
    readFile(new URL('../src/modules/admin/admin.repository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/admin/admin.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/admin/admin.routes.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(routes, /requireDesignatedAdmin/u);
  assert.match(repository, /activity\.create/u);
  assert.match(repository, /isolationLevel: 'Serializable'/u);
  assert.match(service, /ADMIN_SELF_ACTION_DENIED/u);
  assert.doesNotMatch(repository, /encryptedContent|encryptionIv|encryptionTag/u);
  assert.doesNotMatch(repository, /achievements|portfolio|skillProficiencies/u);
  assert.match(service, /UNAVAILABLE_ENCRYPTED_PRIVATE_CONTENT/u);
  assert.match(service, /MIGRATION_PENDING/u);
});
