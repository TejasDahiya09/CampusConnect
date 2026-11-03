import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfessionalProfileCard } from '../src/features/profile/ProfessionalProfileCard';
import { ProfessionalProfileForm } from '../src/features/profile/ProfessionalProfileForm';
import { profileFixture } from './fixtures/profile-fixtures';
const details = {
  headline: 'Student building accessible software',
  education: [
    { institution: 'Synthetic College', qualification: 'Student-supplied qualification' },
  ],
  experience: [
    { role: 'Project contributor', organization: 'Synthetic team', description: 'One\nTwo' },
  ],
};
const render = (profile = profileFixture) =>
  renderToStaticMarkup(
    createElement(ProfessionalProfileCard, {
      profile,
      details,
      storageAvailable: true,
      onEdit: () => {},
      onEditLink: () => {},
    }),
  );
void test('native professional card uses student fields and a safe external LinkedIn URL', () => {
  const html = render();
  for (const value of [
    details.headline,
    details.education[0].institution,
    details.experience[0].role,
    'View LinkedIn Profile',
    'CampusConnect',
  ])
    assert.ok(html.includes(value));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('noopener noreferrer'));
  assert.doesNotMatch(
    html,
    /Imported from LinkedIn|Connect LinkedIn|OAuth|verified seller|<iframe|licdn/,
  );
});
void test('native card has an owner action rather than a broken or unsafe LinkedIn link', () => {
  const html = render({
    ...profileFixture,
    portfolioLinks: [{ id: 'unsafe', label: 'LinkedIn', sortOrder: 0, url: 'javascript:alert(1)' }],
  });
  assert.ok(html.includes('Add LinkedIn Profile'));
  assert.ok(!html.includes('href="javascript'));
});
void test('professional sidebar does not repeat identity, avatar or skills', () => {
  const html = render();
  assert.ok(!html.includes(profileFixture.displayName));
  assert.ok(!html.includes('role="img"'));
  assert.ok(!html.includes('Top skills'));
  assert.ok(!html.includes(profileFixture.skills[0].name));
});
void test('professional data stays hidden when storage is unavailable, with a truthful empty state', () => {
  const html = renderToStaticMarkup(
    createElement(ProfessionalProfileCard, {
      profile: profileFixture,
      details,
      storageAvailable: false,
      onEdit: () => {},
      onEditLink: () => {},
    }),
  );
  assert.ok(html.includes('Your professional story starts here.'));
  assert.ok(html.includes('Professional details pending setup'));
  assert.ok(!html.includes(details.headline));
  assert.ok(!html.includes('Edit professional profile'));
  assert.ok(html.includes('View LinkedIn Profile'));
});
void test('professional entries render unsafe text as text, never HTML', () => {
  const html = renderToStaticMarkup(
    createElement(ProfessionalProfileCard, {
      profile: profileFixture,
      details: { ...details, headline: '<script>unsafe</script>' },
      storageAvailable: true,
      onEdit: () => {},
      onEditLink: () => {},
    }),
  );
  assert.ok(html.includes('&lt;script&gt;unsafe'));
  assert.ok(!html.includes('<script>'));
});
void test('professional editor stays focused on gated details and links to the owning editing sections', () => {
  const html = renderToStaticMarkup(
    createElement(ProfessionalProfileForm, {
      state: { available: false, details: null },
      profile: profileFixture,
      onSave: () => Promise.resolve({ available: false, details: null }),
      onIdentity: () => {},
      onLink: () => {},
    }),
  );
  assert.ok(html.includes('Professional saving is not available yet'));
  assert.ok(!html.includes('Manage profile photo'));
  assert.ok(!html.includes('type="file"'));
  assert.ok(html.includes('disabled=""'));
  assert.ok(!html.includes('Profile photograph'));
  assert.ok(html.includes('Edit LinkedIn URL in Portfolio'));
  assert.ok(html.includes('Personal information'));
});
