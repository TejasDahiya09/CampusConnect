import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ProfileCompletion } from '../src/features/profile/ProfileCompletion';
import { ProfileOverview } from '../src/features/profile/ProfileOverview';
import {
  profilePortfolio,
  safePortfolioHref,
  portfolioLinkPresentation,
  profileDate,
} from '../src/features/profile/profile-overview';
import { profileFixture } from './fixtures/profile-fixtures';
const render = (profile = profileFixture) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ProfileOverview, { profile, onEdit: () => {} }),
    ),
  );
void test('professional link selection preserves stored ordering and retains every other link', () => {
  const before = JSON.stringify(profileFixture.portfolioLinks);
  const { linkedIn, remaining } = profilePortfolio(profileFixture.portfolioLinks);
  assert.equal(linkedIn?.id, 'linkedin-first');
  assert.equal(remaining.length, profileFixture.portfolioLinks.length - 1);
  assert.ok(remaining.some((link) => link.id === 'linkedin-second'));
  assert.equal(JSON.stringify(profileFixture.portfolioLinks), before);
  assert.equal(profilePortfolio([]).linkedIn, undefined);
});
void test('unsafe external URLs are not clickable and canonical HTTPS LinkedIn is required', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,private',
    'https://user:pass@example.test',
    'invalid',
  ])
    assert.equal(safePortfolioHref(value), null);
  assert.equal(safePortfolioHref('https://example.test'), 'https://example.test/');
  assert.equal(
    profilePortfolio([
      { id: 'bad', label: 'Bad', sortOrder: 0, url: 'https://linkedin.example/in/test' },
    ]).linkedIn,
    undefined,
  );
});
void test('overview is read-only and renders every skill, level and original biography', () => {
  const html = render();
  assert.doesNotMatch(html, /<input|<select|<textarea|<form/);
  for (const skill of profileFixture.skills) assert.ok(html.includes(skill.name));
  assert.ok(html.includes('Level 5'));
  assert.ok(html.includes(profileFixture.bio!));
  for (const achievement of profileFixture.achievements)
    assert.ok(html.includes(achievement.title));
  for (const interest of profileFixture.interests) assert.ok(html.includes(interest.name));
});
void test('professional card labels its source honestly and avoids duplicate selected links', () => {
  const html = render();
  assert.ok(html.includes('View LinkedIn Profile'));
  assert.ok(html.includes('Professional profile'));
  assert.doesNotMatch(html, /Imported from LinkedIn/);
  assert.equal(
    (html.match(/href="https:\/\/www.linkedin.com\/in\/synthetic-avery"/g) ?? []).length,
    1,
  );
  assert.ok(html.includes('noopener noreferrer'));
  assert.doesNotMatch(html, /Connected LinkedIn|LinkedIn verified|LinkedIn-imported|<iframe/);
});
void test('completion preserves authoritative values and ten criteria with accurate email wording', () => {
  const html = render();
  assert.ok(html.includes('80%'));
  assert.ok(html.includes('8 of 10 essentials complete'));
  assert.ok(html.includes('Email verified'));
  assert.doesNotMatch(html, /Verified university/);
  assert.ok(html.includes('aria-valuenow="80"'));
});
void test('empty data remains truthful and offers an actionable LinkedIn editor entry', () => {
  const html = render({
    ...profileFixture,
    bio: null,
    skills: [],
    interests: [],
    achievements: [],
    portfolioLinks: [],
    completion: undefined,
  });
  for (const text of [
    'Add LinkedIn Profile',
    'No skills added yet',
    'No interests added yet',
    'No achievements added yet',
  ])
    assert.ok(html.includes(text));
  assert.doesNotMatch(html, /LinkedIn link supplied by student|Profile completion/);
});
void test('React escapes untrusted names and biography without exposing unexpected private properties', () => {
  const html = render({
    ...profileFixture,
    displayName: '<script>unsafe</script>',
    bio: '<img src=x onerror=alert(1)>',
    ...{ email: 'private@example.test', moderationReason: 'private-reason' },
  });
  assert.doesNotMatch(html, /<script>|<img src=x|private@example.test|private-reason/);
  assert.ok(html.includes('&lt;img'));
});

void test('link presentation derives only safe destinations and formats real calendar dates', () => {
  assert.deepEqual(portfolioLinkPresentation('https://github.com/student/project'), {
    icon: 'copy',
    label: 'GitHub',
  });
  assert.equal(portfolioLinkPresentation('https://example.test/project').label, 'example.test');
  assert.equal(portfolioLinkPresentation('javascript:alert(1)').label, 'Update this link');
  assert.equal(profileDate('2026-10-01'), 'Oct 1, 2026');
  assert.equal(profileDate('2026-02-31'), '2026-02-31');
  assert.equal(profileDate('not a date'), 'not a date');
});

void test('completion keeps the authoritative ten-criterion score and avoids dead verification actions', () => {
  const completion = profileFixture.completion!;
  const before = JSON.stringify(completion);
  const html = renderToStaticMarkup(
    createElement(ProfileCompletion, { completion, onEdit: () => {} }),
  );
  assert.equal((html.match(/<li>/g) ?? []).length, 10);
  assert.ok(html.includes('aria-valuenow="80"'));
  assert.ok(html.includes('Email verified'));
  assert.ok(!html.includes('University verified'));
  assert.equal(JSON.stringify(completion), before);
  const complete = {
    ...completion,
    percentage: 100,
    completed: 10,
    criteria: Object.fromEntries(Object.keys(completion.criteria).map((k) => [k, true])),
  };
  const all = renderToStaticMarkup(
    createElement(ProfileCompletion, { completion: complete, onEdit: () => {} }),
  );
  assert.ok(all.includes('100%'));
  assert.ok(!all.includes('Edit missing details'));
});
