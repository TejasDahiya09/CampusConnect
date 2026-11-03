import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isResumeAnalysis } from '../src/modules/profile/resume-analysis.service.js';

void describe('resume analysis contract', () => {
  void it('accepts the bounded normalized skill contract', () => {
    assert.equal(
      isResumeAnalysis({
        skills: [
          {
            category: 'Web Development',
            confidence: 'high',
            evidence: 'Built an app with React',
            method: 'explicit_mention',
            name: 'React',
          },
        ],
        status: 'completed',
      }),
      true,
    );
  });

  void it('rejects malformed, unknown, or oversized upstream output', () => {
    assert.equal(
      isResumeAnalysis({ skills: [{ name: 'Secret', category: 'Unknown' }], status: 'completed' }),
      false,
    );
    assert.equal(
      isResumeAnalysis({ resumeText: 'private', skills: [], status: 'completed' }),
      false,
    );
  });
});
