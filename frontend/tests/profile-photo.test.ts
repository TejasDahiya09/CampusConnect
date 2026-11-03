import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileAvatar } from '../src/features/profile/ProfileAvatar';
import { StudentAvatar } from '../src/features/students/StudentAvatar';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  imageFormat,
  sourceDimensions,
  cropRect,
  panPhoto,
  decodePhoto,
  safePhoto,
  checkedPhotoState,
} from '../src/features/profile/photo-client.js';
import {
  publishOwnAvatar,
  ownAvatar,
  subscribeOwnAvatar,
} from '../src/features/profile/own-avatar.js';
void test('image signature detection accepts JPEG PNG WebP and rejects SVG/disguised files', () => {
  assert.equal(imageFormat(Uint8Array.from([255, 216, 255])), 'image/jpeg');
  assert.equal(imageFormat(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(imageFormat(new TextEncoder().encode('RIFF1234WEBP')), 'image/webp');
  assert.equal(imageFormat(new TextEncoder().encode('<svg><script>')), null);
});
void test('selection rejects empty, oversized and MIME-spoofed files before decode', async () => {
  for (const file of [
    new File([], 'a.png', { type: 'image/png' }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }),
    new File(['<svg/>'], 'a.png', { type: 'image/png' }),
    new File([Uint8Array.from([255, 216, 255])], 'a.png', { type: 'image/png' }),
  ])
    await assert.rejects(() => decodePhoto(file));
});
void test('crop calculations remain square, in bounds and responsive to all three controls', () => {
  for (const [w, h] of [
    [1200, 800],
    [800, 1200],
    [512, 512],
  ])
    for (const zoom of [1, 2, 3])
      for (const x of [-100, 0, 100])
        for (const y of [-100, 0, 100]) {
          const crop = cropRect(w, h, zoom, x, y);
          assert.ok(crop.side <= Math.min(w, h));
          assert.ok(crop.x >= 0 && crop.y >= 0);
          assert.ok(crop.x + crop.side <= w && crop.y + crop.side <= h);
        }
  assert.notEqual(cropRect(1200, 800, 2, 0, 0).x, cropRect(1200, 800, 2, 100, 0).x);
});
void test('photo DTO permits only canonical HTTPS delivery references, never arbitrary keys or URLs', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const value = { type: 'photo', id, url: `https://cdn.example.test/profile-photos/${id}.png` };
  assert.equal(safePhoto(value), true);
  for (const url of [
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'http://cdn.example.test/a',
    value.url + '?token=private',
    value.url + '#private',
    'https://user:pass@cdn.example.test/profile-photos/' + id + '.png',
    'https://cdn.example.test/arbitrary.png',
  ])
    assert.equal(safePhoto({ ...value, url }), false);
  assert.equal(safePhoto({ ...value, id: '------------------------------------' }), false);
  assert.throws(() => checkedPhotoState({ available: true, version: null, avatar: null }));
});
void test('own-account avatar updates are keyed by account, support removal, and unsubscribe cleanly', () => {
  let calls = 0;
  const stop = subscribeOwnAvatar(() => {
    calls++;
  });
  publishOwnAvatar('synthetic-a', null);
  assert.deepEqual(ownAvatar('synthetic-a'), { avatar: null });
  assert.equal(ownAvatar('synthetic-b'), undefined);
  assert.equal(calls, 1);
  stop();
  publishOwnAvatar('synthetic-b', null);
  assert.equal(calls, 1);
});

void test('header dimensions are bounded before decoding image allocations', () => {
  const b = new Uint8Array(24);
  b.set([137, 80, 78, 71, 13, 10, 26, 10]);
  b.set(new TextEncoder().encode('IHDR'), 12);
  const v = new DataView(b.buffer);
  v.setUint32(16, 900);
  v.setUint32(20, 600);
  assert.deepEqual(sourceDimensions(b), { width: 900, height: 600 });
  assert.equal(sourceDimensions(Uint8Array.from([255, 216, 255])), null);
});

void test('Profile and shared student avatar render safe photos while preserving unknown/predefined fallbacks', () => {
  const id = '11111111-1111-4111-8111-111111111111',
    photo = {
      type: 'photo' as const,
      id,
      url: `https://cdn.example.test/profile-photos/${id}.png`,
    };
  for (const component of [
    createElement(ProfileAvatar, { avatar: photo, fallback: 'Student' }),
    createElement(StudentAvatar, { avatar: photo, displayName: 'Student' }),
  ]) {
    const html = renderToStaticMarkup(component);
    assert.ok(html.includes('<img'));
    assert.ok(
      html.includes('referrerPolicy="no-referrer"') ||
        html.includes('referrerpolicy="no-referrer"'),
    );
    assert.ok(html.includes(photo.url));
  }
  const unknown = renderToStaticMarkup(
    createElement(StudentAvatar, {
      avatar: { type: 'photo', id, url: 'javascript:unsafe' },
      displayName: 'Student',
    }),
  );
  assert.ok(!unknown.includes('<img'));
  const preset = renderToStaticMarkup(
    createElement(ProfileAvatar, {
      avatar: { type: 'predefined', id: 'campus-indigo' },
      fallback: 'Student',
    }),
  );
  assert.ok(preset.includes('Selected avatar: campus-indigo'));
  assert.ok(!preset.includes('<img'));
});

void test('pointer positioning moves photo with the drag and preserves crop bounds at all zoom levels', () => {
  for (const [width, height] of [
    [900, 600],
    [600, 900],
    [512, 512],
  ]) {
    for (const zoom of [1, 2, 3]) {
      const origin = cropRect(width, height, zoom, 0, 0);
      const next = panPhoto(width, height, zoom, 0, 0, 12, -10, 240);
      const crop = cropRect(width, height, zoom, next.x, next.y);
      assert.ok(crop.x <= origin.x && crop.y >= origin.y);
      assert.ok(crop.x >= 0 && crop.y >= 0);
      assert.ok(crop.x + crop.side <= width && crop.y + crop.side <= height);
      if (width > origin.side)
        assert.ok(Math.abs(crop.x - (origin.x - (12 * origin.side) / 240)) < 0.00001);
      const edge = panPhoto(width, height, zoom, 0, 0, 100000, -100000, 240);
      assert.ok(edge.x >= -100 && edge.x <= 100 && edge.y >= -100 && edge.y <= 100);
    }
  }
  assert.deepEqual(panPhoto(900, 600, 2, 10, 20, 10, 10, 0), { x: 10, y: 20 });
});
