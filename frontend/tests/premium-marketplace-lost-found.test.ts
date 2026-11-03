import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

void describe('premium Marketplace and Lost and Found experiences', () => {
  void it('preserves Marketplace discovery, saved, media, and lifecycle actions', async () => {
    const [discovery, detail, form, gallery, browse] = await Promise.all([
      source('features/marketplace/MarketplacePage.tsx'),
      source('features/marketplace/ListingDetailPage.tsx'),
      source('features/marketplace/ListingForm.tsx'),
      source('features/marketplace/ListingGallery.tsx'),
      source('features/marketplace/MarketplaceBrowse.tsx'),
    ]);
    assert.match(browse, /MarketplaceHero/);
    assert.doesNotMatch(discovery, /excludedListingIds|excludeIds/);
    assert.match(browse, /cc-filter-chip/);
    const detailView = await source('features/marketplace/MarketplaceListingDetail.tsx');
    assert.match(detailView, /BookmarkButton/);
    assert.match(detailView, /ShareActions/);
    assert.match(detail, /messagingService\.open/);
    assert.match(form, /ImagePicker/);
    assert.match(gallery, /cc-gallery-stage/);
  });

  void it('preserves Lost and Found claims, matching, bookmarks, media, and lifecycle', async () => {
    const [pages, match, media, detail, gallery] = await Promise.all([
      source('features/lost-found/LostFoundPages.tsx'),
      source('features/lost-found/LostFoundMatchExperience.tsx'),
      source('features/lost-found/LostFoundMedia.tsx'),
      source('features/lost-found/LostFoundReportDetail.tsx'),
      source('features/lost-found/LostFoundReportGallery.tsx'),
    ]);
    assert.match(pages, /ClaimPanel/);
    assert.match(pages, /PossibleMatchesPanel/);
    assert.match(detail, /LostFoundBookmarkButton/);
    assert.match(detail, /nextStatuses/);
    assert.match(match, /match\.reasons/);
    assert.match(gallery, /cc-lf-gallery-stage/);
    assert.match(media, /cc-upload-surface/);
  });

  void it('uses semantic shared surfaces for product cards and details', async () => {
    const [listing, report, styles] = await Promise.all([
      source('features/marketplace/ListingCard.tsx'),
      source('features/lost-found/LostFoundCard.tsx'),
      source('index.css'),
    ]);
    assert.match(listing, /cc-feature-card/);
    assert.match(report, /cc-feature-card/);
    assert.match(styles, /\.cc-detail-facts/);
    assert.match(styles, /\.cc-gallery-stage/);
    assert.match(styles, /\.cc-bookmark-control/);
  });
});
