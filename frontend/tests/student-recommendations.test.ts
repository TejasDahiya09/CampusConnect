import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

void describe('TeamUp recommendation UI', () => {
  void it('renders explainable student and project recommendations with existing actions', async () => {
    const source = await readFile(
      new URL('../src/features/students/RecommendationCards.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /matchedSkills/);
    assert.match(source, /missingSkills/);
    assert.match(source, /messagingService[\s\S]*\.open/);
    assert.match(source, /View project/);
    assert.doesNotMatch(source, /email|phone|resumeText|accessToken/i);
  });
  void it('loads organizer-only students on demand and preserves personalized projects', async () => {
    const source = await readFile(
      new URL('../src/features/teamup/TeamUpDetail.tsx', import.meta.url),
      'utf8',
    );
    const browse = await readFile(
      new URL('../src/features/teamup/TeamUpBrowse.tsx', import.meta.url),
      'utf8',
    );
    assert.match(browse, /studentsApi[\s\S]{0,40}\.recommendedProjects/);
    assert.match(source, /project\.viewerIsOwner/);
    assert.match(source, /Find Suitable Students/);
    assert.match(source, /recommendationState === 'loading'/);
    assert.match(source, /Refresh recommendations/);
    assert.match(source, /Retry recommendations/);
    assert.doesNotMatch(source, /useEffect\([\s\S]{0,300}recommendedStudents/);
  });
  void it('removes standalone student discovery from navigation and routes', async () => {
    const navigation = await readFile(
      new URL('../src/app/app-navigation.ts', import.meta.url),
      'utf8',
    );
    const app = await readFile(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(navigation, /Discover Students|\/students/);
    assert.doesNotMatch(app, /StudentDiscoveryPage|path="\/students"/);
  });
});
