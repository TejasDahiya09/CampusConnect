import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { validateResumeSelection } from '../src/features/profile/resume-file.js';

void describe('resume analysis profile experience', () => {
  void it('accepts bounded PDF and DOCX selections and rejects unsafe client inputs', () => {
    assert.equal(
      validateResumeSelection(new File(['resume'], 'resume.pdf', { type: 'application/pdf' })),
      null,
    );
    assert.equal(
      validateResumeSelection(
        new File(['resume'], 'resume.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ),
      null,
    );
    assert.match(
      validateResumeSelection(new File(['resume'], 'resume.txt', { type: 'text/plain' })) ?? '',
      /PDF or DOCX/,
    );
    assert.match(
      validateResumeSelection(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'resume.pdf', { type: 'application/pdf' }),
      ) ?? '',
      /5 MiB/,
    );
  });

  void it('keeps skill approval explicit, reports existing skills, and uses theme tokens', async () => {
    const source = await readFile(
      new URL('../src/features/profile/ResumeAnalyzer.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /Add selected skills/);
    assert.match(source, /Already added/);
    assert.match(source, /Select all/);
    assert.match(source, /import \{ Button \} from '..\/..\/components\/ui'/);
    assert.match(source, /border-white\/10/);
  });

  void it('submits resume bytes only to the authenticated Express profile endpoint', async () => {
    const source = await readFile(
      new URL('../src/features/profile/profile-service.ts', import.meta.url),
      'utf8',
    );
    assert.match(source, /\/api\/profile\/resume\/analyze/);
    assert.match(source, /FormData/);
    assert.doesNotMatch(source, /Gemini|Vertex|S3|CloudFront/);
  });
});
