import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  LostFoundReportDetail,
  LostFoundDetailFeedback,
} from '../src/features/lost-found/LostFoundReportDetail';
import { LostFoundReportGallery } from '../src/features/lost-found/LostFoundReportGallery';
import { LostFoundCard } from '../src/features/lost-found/LostFoundCard';
import {
  lostFoundDateError,
  lostFoundSearch,
  parseLostFoundSearch,
  reportDate,
  reportPhotoCandidates,
} from '../src/features/lost-found/lost-found-presentation';
import { lostFoundFixture as report } from './lost-found-fixture-data';

const render = (node: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node));
const view = (value = report, viewer = { id: 'visitor', role: 'STUDENT' as const }) =>
  render(
    createElement(LostFoundReportDetail, {
      report: value,
      viewer,
      saving: false,
      error: null,
      onStatus: () => undefined,
      onBookmark: () => undefined,
      recovery: createElement('p', null, 'Authorized claim slot'),
      matches: null,
    }),
  );

void describe('Lost & Found modernized presentation', () => {
  void it('round-trips only supported filter contracts and bounds untrusted URL input', () => {
    const filters = parseLostFoundSearch(
      new URLSearchParams(
        'type=FOUND&category=Identity%20card&status=CLAIM_PENDING&location=Library&keyword=ID&dateFrom=2026-10-01&dateTo=2026-10-25&sort=incident_newest&page=2',
      ),
    );
    assert.deepEqual(parseLostFoundSearch(lostFoundSearch(filters)), filters);
    const invalid = parseLostFoundSearch(
      new URLSearchParams(
        'type=SELL&status=SOLD&sort=popular&page=-4&dateFrom=2026-02-30&keyword=' + 'a'.repeat(200),
      ),
    );
    assert.equal(invalid.type, '');
    assert.equal(invalid.status, '');
    assert.equal(invalid.sort, 'newest');
    assert.equal(invalid.page, 1);
    assert.equal(invalid.dateFrom, '');
    assert.equal(invalid.keyword.length, 100);
  });
  void it('validates incident date ranges without changing report-time semantics', () => {
    assert.equal(lostFoundDateError('2026-10-01', '2026-10-25'), null);
    assert.ok(lostFoundDateError('2026-10-26', '2026-10-25'));
    assert.ok(lostFoundDateError('2026-02-30', ''));
    assert.notEqual(reportDate(report.incidentDate, true), reportDate(report.createdAt));
    assert.equal(reportDate(null), 'Not shared');
  });
  void it('uses ordered delivery URLs and never derives URLs from private object keys', () => {
    const images = [...report.images].reverse();
    const result = reportPhotoCandidates([
      ...images,
      { ...report.images[0], id: 'duplicate' },
      { ...report.images[0], id: 'hidden', url: null },
    ]);
    assert.deepEqual(
      result.map((image) => image.url),
      ['/qa-bag.svg', '/qa-book.svg'],
    );
    assert.equal(images[0].id, 'photo-2');
    const html = render(
      createElement(LostFoundReportGallery, {
        images: [{ ...report.images[0], url: null }],
        title: report.title,
      }),
    );
    assert.match(html, /No photos added/);
    assert.doesNotMatch(html, /private-must-not-render|<img|Next image/);
  });
  void it('ignores malformed or executable media URLs without fabricating a replacement', () => {
    const invalid = [
      '',
      '   ',
      'javascript:alert(1)',
      'data:image/png;base64,AA',
      'https://',
      'private/object-key.jpg',
    ];
    assert.deepEqual(
      reportPhotoCandidates(
        invalid.map((url, i) => ({ ...report.images[0], id: `invalid-${i}`, url })),
      ),
      [],
    );
    assert.equal(
      reportPhotoCandidates([
        { ...report.images[0], url: 'https://media.example.test/photo.jpg?signature=supplied' },
      ])[0].url,
      'https://media.example.test/photo.jpg?signature=supplied',
    );
  });
  void it('renders semantically distinct image-first cards with independent Save/Share actions', () => {
    const html = render(createElement(LostFoundCard, { report, variant: 'discovery' }));
    assert.match(html, /Lost item/);
    assert.match(html, /Reported/);
    assert.match(html, /Save report/);
    assert.match(html, /wa.me/);
    assert.match(html, /loading="lazy"/);
    assert.doesNotMatch(html, /Message seller|₹|Buy now|verified|private-must-not-render/);
    assert.match(
      render(
        createElement(LostFoundCard, {
          report: { ...report, type: 'FOUND' },
          variant: 'discovery',
        }),
      ),
      /Found item/,
    );
  });
  void it('preserves complete user text and displays genuine report and incident dates separately', () => {
    const html = view({
      ...report,
      title: '<script>Unsafe title</script>',
      description: 'First line\nSecond line\n\n[campusconnect-examiner-demo-v1]',
    });
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>|private-must-not-render/);
    assert.ok(html.includes('First line\nSecond line\n\n[campusconnect-examiner-demo-v1]'));
    assert.match(html, />Lost on</);
    assert.match(html, />Reported</);
    assert.ok(html.includes(reportDate(report.incidentDate, true)));
    assert.ok(html.includes(reportDate(report.createdAt)));
    assert.equal((html.match(/<dt>Location<\/dt>/g) ?? []).length, 1);
  });
  void it('retains owner controls and truthful lifecycle labels without commerce actions', () => {
    const owned = view(report, { id: report.reporterId, role: 'STUDENT' });
    assert.match(owned, /Your report|Edit report|Update status/);
    assert.doesNotMatch(owned, /Report content|>Report</);
    const visitor = view();
    assert.doesNotMatch(
      visitor,
      /Edit report|Update status|Message seller|Phone|Email|View profile/,
    );
    const resolved = view({ ...report, status: 'RESOLVED' });
    assert.match(resolved, /New claims are unavailable/);
    assert.doesNotMatch(resolved, /Available|Sold/);
    const archived = view({ ...report, status: 'ARCHIVED' });
    assert.doesNotMatch(archived, /aria-label="Save report"/);
  });
  void it('keeps private extras out of the public presentation', () => {
    const unsafe = {
      ...report,
      reporter: { ...report.reporter, email: 'private@example.test', phone: 'private-phone' },
      rawResume: 'private-resume',
      claims: [{ message: 'private-claim-evidence' }],
    };
    assert.doesNotMatch(
      view(unsafe),
      /private@example.test|private-phone|private-resume|private-claim-evidence/,
    );
  });
  void it('supports accessible single/multi-image and loading/unavailable states', () => {
    const multi = render(
      createElement(LostFoundReportGallery, { images: report.images, title: report.title }),
    );
    assert.match(multi, /View larger image/);
    assert.match(multi, /Previous image/);
    assert.match(multi, /aria-pressed="true"/);
    const single = render(
      createElement(LostFoundReportGallery, {
        images: report.images.slice(0, 1),
        title: report.title,
      }),
    );
    assert.doesNotMatch(single, /Previous image|View image 1/);
    assert.match(
      render(createElement(LostFoundDetailFeedback, { loading: true, onRetry: () => undefined })),
      /Loading report/,
    );
    assert.doesNotMatch(
      render(
        createElement(LostFoundDetailFeedback, { error: 'Unavailable', onRetry: () => undefined }),
      ),
      /QA Student|private-must-not-render/,
    );
  });
});
