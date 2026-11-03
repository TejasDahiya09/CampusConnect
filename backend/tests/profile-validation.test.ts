import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePortfolioUrl,
  parsePortfolioInput,
  parseProfilePatch,
  parseSkillInput,
  parseSkillPatch,
} from '../src/modules/profile/profile.validation.js';

void describe('profile validation', () => {
  void it('trims, clears, and bounds profile location', () => {
    assert.deepEqual(parseProfilePatch({ location: '  North Campus Hostel  ' }), {
      location: 'North Campus Hostel',
    });
    assert.deepEqual(parseProfilePatch({ location: '   ' }), { location: null });
    assert.throws(() => parseProfilePatch({ location: 'x'.repeat(181) }), /valid location/i);
  });

  void it('accepts only integer proficiency values from one to five', () => {
    for (const proficiency of [1, 2, 3, 4, 5]) {
      assert.equal(parseSkillInput({ name: 'TypeScript', proficiency }).proficiency, proficiency);
      assert.equal(parseSkillPatch({ proficiency }).proficiency, proficiency);
    }
    for (const proficiency of [0, 6, 1.5, '5']) {
      assert.throws(() => parseSkillInput({ name: 'TypeScript', proficiency }), /proficiency/i);
    }
  });

  void it('accepts allowlisted avatars and rejects arbitrary avatar data', () => {
    assert.deepEqual(parseProfilePatch({ avatar: { id: 'campus-indigo', type: 'predefined' } }), {
      avatar: { id: 'campus-indigo', type: 'predefined' },
    });
    assert.throws(
      () => parseProfilePatch({ avatar: { id: 'unknown', type: 'predefined' } }),
      /predefined avatar/i,
    );
    assert.throws(
      () =>
        parseProfilePatch({
          avatar: {
            id: 'campus-indigo',
            type: 'predefined',
            url: 'https://example.com/avatar.png',
          },
        }),
      /unsupported field/i,
    );
    assert.throws(
      () =>
        parseProfilePatch({ avatar: { id: 'https://example.com/avatar.png', type: 'predefined' } }),
      /predefined avatar/i,
    );
  });

  void it('normalizes legitimate LinkedIn profile URLs and rejects non-profile LinkedIn URLs', () => {
    assert.equal(
      normalizePortfolioUrl('http://linkedin.com/in/campus-student/?trk=profile#about'),
      'https://www.linkedin.com/in/campus-student',
    );
    assert.equal(
      parsePortfolioInput(
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/campus-student/' },
        false,
      ).url,
      'https://www.linkedin.com/in/campus-student',
    );
    assert.throws(
      () =>
        parsePortfolioInput({ label: 'LinkedIn', url: 'https://linkedin.com/company/test' }, false),
      /LinkedIn profile URL/i,
    );
  });
});
