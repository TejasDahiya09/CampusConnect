import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TeamUpProjectCard } from '../src/features/teamup/TeamUpProjectCard';
import { TeamUpRecommendations } from '../src/features/teamup/TeamUpRecommendations';
import {
  defaultTeamUpDiscovery,
  readTeamUpDiscovery,
  writeTeamUpDiscovery,
  teamUpCapacity,
  teamUpDeadline,
} from '../src/features/teamup/teamup-discovery';
import { teamUpFixtureProject as project } from './teamup-fixture-data';
const render = (node: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node));
void describe('TeamUp Browse discovery and presentation', () => {
  void it('round-trips each supported discovery field and preserves OPEN defaults', () => {
    assert.deepEqual(readTeamUpDiscovery(new URLSearchParams()), defaultTeamUpDiscovery);
    const state = {
      ...defaultTeamUpDiscovery,
      keyword: 'campus',
      skill: 'React',
      status: 'FULL' as const,
      sort: 'deadline' as const,
      page: 3,
    };
    assert.deepEqual(readTeamUpDiscovery(writeTeamUpDiscovery(state)), state);
    assert.equal(writeTeamUpDiscovery(defaultTeamUpDiscovery).toString(), '');
  });
  void it('keeps an explicit all-status URL distinct from the default OPEN API filter', () => {
    const state = { ...defaultTeamUpDiscovery, status: '' as const };
    assert.equal(writeTeamUpDiscovery(state).get('status'), 'all');
    assert.equal(readTeamUpDiscovery(writeTeamUpDiscovery(state)).status, '');
  });
  void it('bounds unsupported or malformed URL values without inventing category filtering', () => {
    const state = readTeamUpDiscovery(
      new URLSearchParams(
        'category=AI&status=CLOSED&sort=popular&page=1e2&keyword=' +
          'x'.repeat(200) +
          '&skill=' +
          'y'.repeat(100),
      ),
    );
    assert.equal(state.status, 'OPEN');
    assert.equal(state.sort, 'newest');
    assert.equal(state.page, 1);
    assert.equal(state.keyword.length, 100);
    assert.equal(state.skill.length, 50);
    assert.equal(writeTeamUpDiscovery(state).has('category'), false);
    assert.equal(readTeamUpDiscovery(new URLSearchParams('page=1000001')).page, 1);
  });
  void it('uses actual owner-inclusive capacity and lifecycle without inventing roles', () => {
    assert.equal(teamUpCapacity(project), '3 places available');
    assert.equal(teamUpCapacity({ ...project, currentMemberCount: 4, maxMembers: 4 }), 'Full team');
    assert.equal(teamUpCapacity({ ...project, status: 'FULL' }), 'Full team');
    assert.equal(teamUpCapacity({ ...project, status: 'COMPLETED' }), 'Recruitment closed');
    assert.equal(teamUpCapacity({ ...project, status: 'ARCHIVED' }), 'Recruitment closed');
  });
  void it('renders complete accessible titles, genuine skills, capacity and canonical detail links', () => {
    const html = render(
      createElement(TeamUpProjectCard, {
        project: {
          ...project,
          title: '<script>Long project title</script>',
          requiredSkills: ['React', 'TypeScript', 'Research', 'UI/UX', 'Python'],
        },
      }),
    );
    assert.match(html, /View project: &lt;script&gt;/);
    assert.match(html, /href="\/teamup\//);
    assert.match(html, /1\/4 members/);
    assert.match(html, /3 places available/);
    assert.match(html, /\+1 more/);
    assert.doesNotMatch(html, /<script>|<img|open roles|verified|rating/);
  });
  void it('handles absent metadata without fabricated dates, skills or media', () => {
    const html = render(
      createElement(TeamUpProjectCard, {
        project: { ...project, category: null, deadline: null, requiredSkills: [] },
      }),
    );
    assert.match(html, /Student project/);
    assert.match(html, /No specific skills listed/);
    assert.match(html, /No deadline/);
    assert.equal(teamUpDeadline(null), 'No deadline');
    assert.equal(teamUpDeadline('bad'), 'Deadline not available');
  });
  void it('distinguishes recommendation loading, empty and failure states', () => {
    const renderState = (items: null | [], error: boolean) =>
      render(createElement(TeamUpRecommendations, { items, error, onRetry: () => undefined }));
    assert.match(renderState(null, false), /Finding relevant projects/);
    assert.match(renderState([], false), /No evidence-based recommendations yet/);
    assert.match(renderState(null, true), /Retry recommendations/);
    assert.doesNotMatch(renderState(null, true), /No evidence-based recommendations yet/);
  });
  void it('keeps every returned recommendation in an accessible compact rail with real detail links', () => {
    const html = render(
      createElement(TeamUpRecommendations, {
        items: Array.from({ length: 4 }, (_, index) => ({
          project: { ...project, id: `11111111-1111-4111-8111-11111111111${index}` },
          match: {
            label: 'Relevant skill alignment',
            matchedSkills: ['React'],
            missingSkills: [],
            reasons: ['Matches React.'],
            score: 0.7,
            semanticAvailable: false,
          },
        })),
        error: false,
        onRetry: () => undefined,
      }),
    );
    assert.equal((html.match(/class="cc-tu-rec-card"/g) ?? []).length, 4);
    assert.match(html, /role="region" aria-label="Recommended projects"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /Home or End/);
    assert.match(html, /4 suggested projects/);
    assert.doesNotMatch(html, /View all|0\.7|70%/);
  });
});
