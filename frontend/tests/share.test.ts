import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  formatShareMessage,
  whatsappShareUrl,
  type ShareRecord,
} from '../src/features/share/share.js';

const records: readonly ShareRecord[] = [
  {
    category: 'Books',
    description: 'A clean textbook. [campusconnect-examiner-demo-v1]',
    id: 'market-1',
    location: 'Library gate',
    module: 'MARKETPLACE',
    price: '₹500',
    status: 'ACTIVE',
    title: 'Data Structures textbook',
  },
  {
    category: 'Accessories',
    description: 'Grey backpack reported missing.',
    id: 'lost-1',
    location: 'Central Library',
    module: 'LOST_FOUND',
    status: 'OPEN',
    title: 'Grey college backpack',
    type: 'LOST',
  },
  {
    category: 'Software',
    description: 'Building an accessible campus navigation tool.',
    id: 'team-1',
    module: 'TEAMUP',
    skills: ['React', 'TypeScript'],
    status: 'OPEN',
    title: 'Campus navigation project',
  },
  {
    category: 'Tutoring',
    description: 'Peer calculus tutoring.',
    id: 'service-1',
    location: 'North Campus',
    module: 'SERVICE',
    price: '₹300',
    skills: ['Calculus'],
    status: 'ACTIVE',
    title: 'Calculus tutoring',
  },
];

void describe('universal sharing', () => {
  void it('uses a polished module-specific template for all four modules', () => {
    const headings = ['MARKETPLACE', 'LOST & FOUND', 'TEAMUP', 'STUDENT SERVICES'];
    records.forEach((record, index) => {
      const message = formatShareMessage(record);
      assert.match(message, new RegExp(`CAMPUSCONNECT \\| ${headings[index]}`));
      assert.match(message, new RegExp(record.title));
      assert.match(message, /Connect\. Collaborate\. Grow\./);
      assert.doesNotMatch(message, /localhost|market-1|lost-1|team-1|service-1/);
      assert.doesNotMatch(message, /campusconnect-examiner-demo-v1/i);
      assert.doesNotMatch(message, /accessToken|claimant|privateContact/);
    });
  });

  void it('uses only explicitly supplied valid public contact email', () => {
    const team = records[2];
    assert.ok(team?.module === 'TEAMUP');
    assert.match(formatShareMessage(team), /Use CampusConnect messaging/);
    assert.doesNotMatch(formatShareMessage(team), /@/);
    assert.match(
      formatShareMessage({ ...team, publicContactEmail: 'owner.public@example.edu' }),
      /owner\.public@example\.edu/,
    );
    assert.doesNotMatch(
      formatShareMessage({ ...team, publicContactEmail: 'not-an-email' }),
      /not-an-email/,
    );
  });

  void it('correctly encodes the exact formatted message for WhatsApp', () => {
    const record = records[0];
    assert.ok(record);
    const message = formatShareMessage(record);
    const shareUrl = whatsappShareUrl(message);
    assert.ok(shareUrl.startsWith('https://wa.me/?text='));
    assert.equal(new URL(shareUrl).searchParams.get('text'), message);
    assert.ok(!shareUrl.includes(' '));
  });

  void it('keeps Lost & Found claim and identity details private', () => {
    const record = records[1];
    assert.ok(record);
    const message = formatShareMessage(record);
    assert.doesNotMatch(message, /reporter|claimant|email|phone|token/i);
    assert.match(message, /claim details remain private/i);
  });

  void it('uses the same message for WhatsApp, copy, and native share', async () => {
    const source = await readFile(
      new URL('../src/features/share/ShareActions.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /whatsappShareUrl\(message\)/);
    assert.match(source, /copy\(message/);
    assert.match(source, /navigator\.share\(\{ text: message, title: record\.title \}\)/);
    assert.doesNotMatch(source, /navigator\.share\(\{[^}]*url/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /cc-button cc-button--primary/);
  });
});
