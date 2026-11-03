import type { TeamUpDraft } from './teamup.types';

export function addProjectSkills(current: readonly string[], input: string) {
  const added = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!added.length) return { skills: current, error: 'Enter a skill to add.' };
  const skills = [...current, ...added];
  if (skills.length > 12) return { skills: current, error: 'Choose up to 12 skills.' };
  if (added.some((value) => value.length > 50))
    return { skills: current, error: 'Each skill must be 50 characters or fewer.' };
  if (new Set(skills.map((value) => value.toLowerCase())).size !== skills.length)
    return { skills: current, error: 'That skill is already selected. Skills must be unique.' };
  return { skills, error: null };
}
export function validateProjectDraft(draft: TeamUpDraft, minimum = 2): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.title.trim().length < 3 || draft.title.trim().length > 180)
    errors.title = 'Use between 3 and 180 characters.';
  if (draft.description.trim().length < 20 || draft.description.trim().length > 5000)
    errors.description = 'Use between 20 and 5,000 characters.';
  if (draft.category !== '' && (!draft.category.trim() || draft.category.trim().length > 100))
    errors.category = 'Use up to 100 characters, or leave this blank.';
  if (!Number.isInteger(draft.maxMembers) || draft.maxMembers < minimum || draft.maxMembers > 20)
    errors.maxMembers = `Choose a whole number between ${minimum} and 20. The owner counts as a member.`;
  if (
    draft.requiredSkills.length > 12 ||
    draft.requiredSkills.some((value) => !value.trim() || value.trim().length > 50) ||
    new Set(draft.requiredSkills.map((value) => value.trim().toLowerCase())).size !==
      draft.requiredSkills.length
  )
    errors.requiredSkills = 'Choose up to 12 unique skills, each 1–50 characters.';
  if (draft.deadline) {
    const date = new Date(`${draft.deadline}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.deadline) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== draft.deadline
    )
      errors.deadline = 'Choose a valid calendar date.';
  }
  return errors;
}
export function changedProjectFields(
  initial: TeamUpDraft,
  draft: TeamUpDraft,
): Partial<TeamUpDraft> {
  return Object.fromEntries(
    (Object.keys(initial) as (keyof TeamUpDraft)[])
      .filter((key) => JSON.stringify(initial[key]) !== JSON.stringify(draft[key]))
      .map((key) => [key, draft[key]]),
  );
}
