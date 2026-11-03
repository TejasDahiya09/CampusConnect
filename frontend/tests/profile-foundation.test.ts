import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { ApiClientError } from '../src/services/api-client.js';
import { predefinedAvatars } from '../src/features/profile/profile-avatar-catalog.js';
import {
  isValidPublicProfileId,
  publicProfileErrorMessage,
} from '../src/features/profile/public-profile.js';
import { isLinkedInProfileUrl } from '../src/features/profile/linkedin.js';

void describe('profile frontend foundations', () => {
  void it('accepts user-specific public UUIDs and rejects misleading route values', () => {
    assert.equal(isValidPublicProfileId('11111111-1111-4111-8111-111111111111'), true);
    assert.equal(isValidPublicProfileId('public'), false);
    assert.equal(isValidPublicProfileId('not-a-user-id'), false);
  });

  void it('maps public not-found and general API failures truthfully', () => {
    assert.equal(
      publicProfileErrorMessage(new ApiClientError('PROFILE_NOT_FOUND', 'Not found', 404)),
      'This student profile was not found.',
    );
    assert.equal(
      publicProfileErrorMessage(new Error('Network unavailable')),
      'Network unavailable',
    );
  });

  void it('exposes only the fixed predefined avatar catalog', () => {
    assert.deepEqual(
      predefinedAvatars.map(({ id }) => id),
      ['campus-indigo', 'campus-cyan', 'campus-amber', 'campus-rose'],
    );
  });

  void it('recognizes only canonical HTTPS LinkedIn member profile URLs', () => {
    assert.equal(isLinkedInProfileUrl('https://www.linkedin.com/in/campus-student'), true);
    assert.equal(isLinkedInProfileUrl('https://linkedin.com/in/campus-student/'), true);
    assert.equal(isLinkedInProfileUrl('http://linkedin.com/in/campus-student'), false);
    assert.equal(isLinkedInProfileUrl('https://linkedin.com/company/campus'), false);
    assert.equal(isLinkedInProfileUrl('https://linkedin.example/in/campus-student'), false);
  });

  void it('exposes LinkedIn actions in editable and public profile presentations', async () => {
    const [manager, publicProfile] = await Promise.all([
      readFile(new URL('../src/features/profile/PortfolioManager.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/features/profile/PublicProfilePage.tsx', import.meta.url), 'utf8'),
    ]);
    assert.match(manager, /View LinkedIn profile/);
    assert.match(manager, /Edit/);
    assert.match(manager, /Delete/);
    assert.match(publicProfile, /View LinkedIn profile/);
  });
});
