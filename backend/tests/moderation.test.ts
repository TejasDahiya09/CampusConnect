import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ReportReason } from '../src/generated/prisma/client.js';
import { analyzeSafetyText } from '../src/modules/moderation/spam-detection.js';
import {
  parseModerationDecision,
  parseModerationQuery,
  parseReportSubmission,
} from '../src/modules/moderation/moderation.validation.js';

const uuid = '123e4567-e89b-42d3-a456-426614174000';

void test('report submission accepts only bounded, supported input', () => {
  assert.deepEqual(
    parseReportSubmission({
      description: '  misleading   payment request ',
      reason: ReportReason.SCAM,
      targetId: uuid,
      targetType: 'MARKETPLACE',
    }),
    {
      description: 'misleading payment request',
      reason: ReportReason.SCAM,
      targetId: uuid,
      targetType: 'MARKETPLACE',
    },
  );
  assert.throws(() =>
    parseReportSubmission({ reason: 'UNKNOWN', targetId: uuid, targetType: 'PROFILE' }),
  );
  assert.throws(() =>
    parseReportSubmission({ extra: true, reason: 'SPAM', targetId: uuid, targetType: 'PROFILE' }),
  );
  assert.throws(() =>
    parseReportSubmission({
      description: 'x'.repeat(1001),
      reason: 'SPAM',
      targetId: uuid,
      targetType: 'PROFILE',
    }),
  );
});

void test('moderation query and decision parsing enforce bounds and lifecycle', () => {
  assert.deepEqual(parseModerationQuery({ limit: '10', page: '2', status: 'OPEN' }), {
    limit: 10,
    page: 2,
    reason: undefined,
    search: undefined,
    status: 'OPEN',
    targetType: undefined,
  });
  assert.throws(() => parseModerationQuery({ limit: '100' }));
  assert.throws(() => parseModerationDecision({ resolutionNote: 'done', status: 'OPEN' }));
  assert.equal(
    parseModerationDecision({ resolutionNote: ' Reviewed safely. ', status: 'RESOLVED' })
      .resolutionNote,
    'Reviewed safely.',
  );
});

void test('safety signals are deterministic, bounded, and never punitive', () => {
  const spam =
    'buy now today '.repeat(5) +
    'https://one.example https://two.example https://three.example share your OTP';
  const first = analyzeSafetyText(spam);
  assert.deepEqual(first, analyzeSafetyText(spam));
  assert.deepEqual(first.map(({ code }) => code).sort(), [
    'COMMON_SCAM_LANGUAGE',
    'EXCESSIVE_LINKS',
    'REPETITIVE_CONTENT',
  ]);
  assert.deepEqual(analyzeSafetyText(''), []);
  assert.deepEqual(
    analyzeSafetyText('Study group seeking students for a database normalization assignment.'),
    [],
  );
  assert.equal(
    first.some((signal) => 'suspend' in signal || 'delete' in signal),
    false,
  );
});

void test('moderation routes enforce authentication and elevated roles', async () => {
  const routes = await readFile(
    new URL('../src/modules/moderation/moderation.routes.ts', import.meta.url),
    'utf8',
  );
  const repository = await readFile(
    new URL('../src/modules/moderation/moderation.repository.ts', import.meta.url),
    'utf8',
  );
  const authMiddleware = await readFile(
    new URL('../src/modules/auth/auth.middleware.ts', import.meta.url),
    'utf8',
  );
  assert.match(routes, /moderationRouter\.use\(authenticationMiddleware\.requireAuth\)/u);
  assert.match(authMiddleware, /user\.status !== AccountStatus\.ACTIVE/u);
  assert.match(routes, /requireRole\(UserRole\.MODERATOR, UserRole\.ADMIN\)/u);
  assert.match(repository, /pg_advisory_xact_lock/u);
  assert.match(repository, /activity\.create/u);
  assert.match(repository, /count\(\{[\s\S]*reporterId/u);
});

void test('reporter notifications remain private and navigate to an authorized page', async () => {
  const service = await readFile(
    new URL('../src/modules/moderation/moderation.service.ts', import.meta.url),
    'utf8',
  );
  const notifications = await readFile(
    new URL('../src/modules/notifications/notifications.repository.ts', import.meta.url),
    'utf8',
  );
  assert.match(service, /Confidential moderation details are not disclosed/u);
  assert.match(service, /entityType: 'NOTIFICATIONS'/u);
  assert.match(notifications, /entityType === 'NOTIFICATIONS'[\s\S]*'\/notifications'/u);
  assert.doesNotMatch(service, /reporter\.profile|reporterEmail|reporterName/u);
});
