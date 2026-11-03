import assert from 'node:assert/strict';
import test from 'node:test';
import { professionalError } from '../src/features/profile/useProfessionalProfile';
import { ApiClientError } from '../src/services/api-client';
import { parseProfessionalState } from '../src/features/profile/professional-profile';
void test('malformed professional success is never an empty saved profile', () => {
  for (const raw of [
    null,
    {},
    { available: true, details: null },
    { available: true, version: 'a'.repeat(64), details: {} },
    {
      available: true,
      version: 'a'.repeat(64),
      details: {
        headline: null,
        education: [{ institution: '', qualification: '' }],
        experience: [],
      },
    },
  ])
    assert.throws(() => parseProfessionalState(raw));
  assert.deepEqual(parseProfessionalState({ available: false, details: { private: 'ignored' } }), {
    available: false,
    details: null,
    version: null,
  });
  assert.deepEqual(
    parseProfessionalState({ available: true, version: 'a'.repeat(64), details: null }),
    { available: true, version: 'a'.repeat(64), details: null },
  );
});
void test('professional failure messages distinguish authentication, server, conflict and network without exposing payloads', () => {
  for (const status of [401, 403])
    assert.match(
      professionalError(new ApiClientError('error', 'private', status)),
      /Sign in again/,
    );
  assert.match(
    professionalError(new ApiClientError('error', 'private', 503)),
    /service is unavailable/,
  );
  assert.match(professionalError(new ApiClientError('error', 'private', 409)), /changed elsewhere/);
  assert.match(professionalError(new Error('private')), /connection/);
  assert.ok(!professionalError(new Error('private')).includes('private'));
});
