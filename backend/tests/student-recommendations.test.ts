import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  combineScore,
  explicitSignals,
  normalizeSkill,
} from '../src/modules/students/recommendation-scoring.js';
import { parseStudentDiscovery } from '../src/modules/students/students.validation.js';

void describe('student and TeamUp recommendation foundations', () => {
  void it('normalizes only explicit safe aliases', () => {
    assert.equal(normalizeSkill('React.js'), 'react');
    assert.equal(normalizeSkill('NodeJS'), 'node.js');
    assert.equal(normalizeSkill('Postgres'), 'postgresql');
    assert.notEqual(normalizeSkill('Java'), normalizeSkill('JavaScript'));
  });
  void it('calculates transparent overlap without inventing proficiency or experience', () => {
    const signals = explicitSignals(
      ['Python', 'React', 'PostgreSQL'],
      ['Python', 'React.js'],
      ['Data Science'],
    );
    assert.deepEqual(signals.matchedSkills, ['python', 'react']);
    assert.deepEqual(signals.missingSkills, ['postgresql']);
    assert.equal(signals.skillRatio, 2 / 3);
    assert.equal('proficiency' in signals, false);
  });
  void it('redistributes unavailable semantic and interest weight deterministically', () => {
    assert.equal(combineScore(0.5, null, 0), 0.5);
    assert.equal(combineScore(1, 0.5, 0), (0.6 + 0.125) / 0.85);
  });
  void it('bounds discovery pagination and rejects unsupported input', () => {
    assert.deepEqual(parseStudentDiscovery({ page: '2', skill: 'React' }).page, 2);
    assert.throws(
      () => parseStudentDiscovery({ privateEmail: 'x' }),
      /Invalid student discovery query/,
    );
    assert.throws(
      () => parseStudentDiscovery({ limit: '1000' }),
      /Invalid student discovery query/,
    );
  });
  void it('keeps authorization, eligibility, and public projection server-side', async () => {
    const service = await readFile(
      new URL('../src/modules/students/students.service.ts', import.meta.url),
      'utf8',
    );
    const routes = await readFile(
      new URL('../src/modules/teamup/teamup.routes.ts', import.meta.url),
      'utf8',
    );
    assert.match(service, /status: AccountStatus\.ACTIVE/);
    assert.match(service, /project\.ownerId !== ownerId/);
    assert.match(service, /id: \{ notIn: \[\.\.\.excluded\] \}/);
    assert.match(service, /ownerId: \{ not: userId \}/);
    assert.match(service, /status: ProjectStatus\.OPEN/);
    assert.match(routes, /authentication\.requireAuth/);
    assert.doesNotMatch(service, /email: true|phone: true|resumeText: true/);
  });
});
