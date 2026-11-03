import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addProjectSkills,
  changedProjectFields,
  validateProjectDraft,
} from '../src/features/teamup/teamup-management';
import type { TeamUpDraft } from '../src/features/teamup/teamup.types';
const draft: TeamUpDraft = {
  title: 'Campus project',
  description: 'A genuine description of a collaborative student project.',
  category: 'Research',
  requiredSkills: ['React'],
  maxMembers: 5,
  deadline: '2026-12-01',
  featuredOnLanding: false,
};
void describe('TeamUp management form constraints', () => {
  void it('adds custom skills without changing existing selections', () => {
    assert.deepEqual(addProjectSkills(draft.requiredSkills, ' Research, TypeScript ').skills, [
      'React',
      'Research',
      'TypeScript',
    ]);
    assert.equal(
      addProjectSkills(draft.requiredSkills, 'react').error?.includes('already selected'),
      true,
    );
    assert.deepEqual(draft.requiredSkills, ['React']);
  });
  void it('enforces the real 12-skill and 50-character limits', () => {
    assert.ok(
      addProjectSkills(
        Array.from({ length: 12 }, (_, index) => 'Skill ' + index),
        'More',
      ).error,
    );
    assert.ok(addProjectSkills([], 'x'.repeat(51)).error);
    assert.ok(addProjectSkills([], '').error);
  });
  void it('matches backend text, integer capacity and calendar validation', () => {
    assert.deepEqual(validateProjectDraft(draft), {});
    for (const patch of [
      { title: '  ' },
      { description: 'short' },
      { description: 'x'.repeat(5001) },
      { category: 'x'.repeat(101) },
      { maxMembers: 2.5 },
      { maxMembers: 21 },
      { deadline: '2026-02-30' },
    ])
      assert.ok(Object.keys(validateProjectDraft({ ...draft, ...patch })).length);
    assert.ok(validateProjectDraft({ ...draft, maxMembers: 3 }, 4).maxMembers);
    assert.deepEqual(
      validateProjectDraft({ ...draft, deadline: '2020-01-01' }),
      {},
      'No invented future-date rule',
    );
  });
  void it('patches only changed fields and preserves consent, date and capacity otherwise', () => {
    assert.deepEqual(changedProjectFields(draft, { ...draft, title: 'New title' }), {
      title: 'New title',
    });
    assert.deepEqual(changedProjectFields(draft, { ...draft, featuredOnLanding: true }), {
      featuredOnLanding: true,
    });
    assert.deepEqual(changedProjectFields(draft, { ...draft, deadline: '' }), { deadline: '' });
    assert.deepEqual(changedProjectFields(draft, { ...draft }), {});
  });
});
