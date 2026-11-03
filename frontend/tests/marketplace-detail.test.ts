import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  MarketplaceListingDetail,
  ListingDetailFeedback,
} from '../src/features/marketplace/MarketplaceListingDetail';
import { ListingGallery } from '../src/features/marketplace/ListingGallery';
import { listingDetailPermissions } from '../src/features/marketplace/listing-detail-permissions';
import { formatPrice } from '../src/features/marketplace/marketplace-format';
import { detailFixture as listing } from './marketplace-detail-fixture-data';

const render = (child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, child));
const view = (overrides: Partial<Parameters<typeof MarketplaceListingDetail>[0]> = {}) =>
  render(
    createElement(MarketplaceListingDetail, {
      listing,
      viewerId: 'visitor',
      active: true,
      pending: null,
      error: null,
      onBookmarkChange: () => undefined,
      onMessage: () => Promise.resolve(true),
      onSold: () => Promise.resolve(true),
      onArchive: () => Promise.resolve(true),
      ...overrides,
    }),
  );
void describe('C + B listing details', () => {
  void it('renders only actual authorized fields and truthful seller information', () => {
    const html = view();
    for (const text of [
      listing.title,
      formatPrice(listing.price, listing.currency),
      'Available',
      '>Good</span>',
      'Electronics',
      'QA Student',
      'Computing',
      'About this item',
    ])
      assert.ok(html.includes(text));
    assert.match(html, /href="\/profile\/22222222-2222-4222-8222-222222222222"/);
    assert.doesNotMatch(
      html,
      /Verified seller|Usually replies|Warranty|RAM|Stock|Delivery estimate/i,
    );
  });
  void it('enforces active visitor contact and active owner edit/sold/archive presentation', () => {
    assert.equal(listingDetailPermissions(listing, 'visitor', true).canMessage, true);
    const owner = view({ viewerId: listing.sellerId });
    assert.match(owner, /Edit listing|Mark as sold|Archive listing/);
    assert.doesNotMatch(owner, /Message seller|>Report</);
    assert.doesNotMatch(view(), /Edit listing|Mark as sold|Archive listing/);
    assert.equal(listingDetailPermissions(listing, listing.sellerId, false).canEdit, false);
    assert.equal(listingDetailPermissions(listing, 'visitor', false).canMessage, false);
    assert.equal(listingDetailPermissions(listing, null, true).canMessage, false);
  });
  void it('keeps SOLD status distinct from condition and blocks new seller conversations', () => {
    const sold = { ...listing, status: 'SOLD' as const };
    const html = view({ listing: sold });
    assert.match(html, /This item has been sold/);
    assert.match(html, /<span>Good<\/span>/);
    assert.doesNotMatch(html, />Message seller</);
    assert.equal(listingDetailPermissions(sold, listing.sellerId, true).canEdit, false);
    assert.equal(listingDetailPermissions(sold, listing.sellerId, true).canArchive, true);
  });
  void it('renders ordered genuine thumbnails without duplicate or empty candidates', () => {
    const html = render(
      createElement(ListingGallery, {
        title: listing.title,
        media: [...listing.media].reverse().concat([
          { ...listing.media[0], id: 'duplicate' },
          { ...listing.media[0], id: 'empty', url: null },
        ]),
      }),
    );
    assert.match(html, /View larger image/);
    assert.match(html, /Previous image/);
    assert.match(html, /Next image/);
    assert.equal((html.match(/aria-label="View image /g) ?? []).length, 3);
    assert.match(html, /src="\/qa-landscape.svg"/);
    assert.match(html, /1 \/ 3/);
    assert.match(html, /aria-pressed="true"/);
  });
  void it('handles a single image and honest missing-media fallback', () => {
    const single = render(
      createElement(ListingGallery, { title: listing.title, media: [listing.media[0]] }),
    );
    assert.match(single, /cc-listing-gallery--single/);
    assert.match(single, /View larger image/);
    assert.doesNotMatch(single, /cc-listing-image-count/);
    assert.doesNotMatch(single, /Previous image|Next image|View image 1/);
    const empty = render(createElement(ListingGallery, { title: listing.title, media: [] }));
    assert.match(empty, /No photos added/);
    assert.doesNotMatch(empty, /<img|View larger image/);
  });
  void it('distinguishes loading, transient errors and inaccessible listings without fake data', () => {
    assert.match(
      render(createElement(ListingDetailFeedback, { loading: true })),
      /Loading listing/,
    );
    const error = render(
      createElement(ListingDetailFeedback, { error: 'Please retry.', onRetry: () => undefined }),
    );
    assert.match(error, /Retry listing/);
    assert.match(error, /role="alert"/);
    const missing = render(createElement(ListingDetailFeedback, { unavailable: true }));
    assert.match(missing, /Listing unavailable/);
    assert.doesNotMatch(missing, /Retry listing|QA Student/);
  });
  void it('escapes long user text, preserves description breaks and excludes private DTO extras', () => {
    const unsafe = {
      ...listing,
      title: '<script>alert(1)</script> ' + 'Long '.repeat(50),
      description: 'First line\nSecond line\n[campusconnect-examiner-demo-v1]',
      seller: { ...listing.seller, email: 'private@example.test', phone: 'private-phone' },
      rawResume: 'private-resume',
    };
    const html = view({ listing: unsafe });
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>|private@example.test|private-phone|private-resume/);
    assert.ok(html.includes('First line\nSecond line'));
    assert.ok(html.includes('[campusconnect-examiner-demo-v1]'));
    assert.match(
      view({ listing: { ...listing, description: ' ' } }),
      /has not added a description/,
    );
  });
  void it('keeps save state, pending guards and failure announcements', () => {
    assert.match(view({ listing: { ...listing, isBookmarked: true } }), /aria-pressed="true"/);
    const pending = view({ pending: 'message', error: 'Conversation could not be opened.' });
    assert.match(pending, /Opening conversation/);
    assert.match(pending, /aria-busy="true"/);
    assert.match(pending, /role="alert"/);
  });
  void it('groups secondary actions separately from contact and presents safety advice once', () => {
    const html = view();
    assert.match(html, /cc-listing-report/);
    assert.match(html, /View profile/);
    assert.match(html, /id="listing-safety-title"/);
    assert.equal((html.match(/Meet in a public place/g) ?? []).length, 1);
    assert.match(html, /cc-listing-contact/);
    assert.doesNotMatch(html, /Response time|Online now|Verified seller/);
  });
  void it('shows the complete description and each detail directly without obsolete tabs', () => {
    const html = view();
    assert.equal((html.match(/<dt>Location<\/dt>/g) ?? []).length, 1);
    assert.equal((html.match(/<dt>Listed<\/dt>/g) ?? []).length, 1);
    assert.doesNotMatch(html, /role="tab|cc-listing-bottom|cc-listing-tabs/);
    assert.doesNotMatch(html, /Listing highlights|Buy now|Make offer|Checkout|RAM|Storage/);
    assert.ok(html.includes(listing.description));
    const about = html.indexOf('id="listing-about-heading"');
    const details = html.indexOf('id="listing-details-heading"');
    const location = html.indexOf('id="listing-location-heading"');
    assert.ok(about > html.indexOf('cc-listing-secondary-actions'));
    assert.ok(about < details && details < location);
  });
});
