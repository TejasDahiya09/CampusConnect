import { safePhoto } from '../profile/profile-avatar-value';
import { StudentAvatar } from '../students/StudentAvatar';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Modal } from '../../components/ui';
import { BookmarkButton } from './BookmarkButton';
import { ListingGallery } from './ListingGallery';
import { formatDate, formatPrice, readableEnum } from './marketplace-format';
import { listingDetailPermissions } from './listing-detail-permissions';
import { ShareActions } from '../share/ShareActions';
import { ReportAction } from '../moderation/ReportAction';
import type { MarketplaceListing } from './marketplace.types';

export type ListingDetailOperation = 'message' | 'sold' | 'archive' | null;
export interface MarketplaceListingDetailProps {
  readonly listing: MarketplaceListing;
  readonly viewerId: string | null;
  readonly active: boolean;
  readonly pending: ListingDetailOperation;
  readonly error: string | null;
  readonly onBookmarkChange: (saved: boolean) => void;
  readonly onMessage: () => Promise<boolean>;
  readonly onSold: () => Promise<boolean>;
  readonly onArchive: () => Promise<boolean>;
}

export function ListingDetailFeedback({
  loading = false,
  unavailable = false,
  error,
  onRetry,
}: {
  readonly loading?: boolean;
  readonly unavailable?: boolean;
  readonly error?: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="cc-page cc-listing-detail" aria-busy={loading}>
      <Link className="cc-listing-back" to="/marketplace">
        <Icon name="chevron" />
        Back to Marketplace
      </Link>
      {loading ? (
        <div className="cc-listing-loading" role="status">
          <span className="sr-only">Loading listing</span>
          <div className="cc-skeleton cc-listing-loading-photo" />
          <div>
            <div className="cc-skeleton h-10 w-full" />
            <div className="cc-skeleton mt-4 h-8 w-1/2" />
            <div className="cc-skeleton mt-8 h-40 w-full" />
          </div>
        </div>
      ) : (
        <section className="cc-listing-unavailable" role="alert">
          <Icon name="store" />
          <h1>{unavailable ? 'Listing unavailable' : 'We could not load this listing'}</h1>
          <p>
            {unavailable
              ? 'This item may no longer be available, or you may not have access to it.'
              : (error ?? 'Please try again in a moment.')}
          </p>
          {!unavailable && onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              Retry listing
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}

export function MarketplaceListingDetail(props: MarketplaceListingDetailProps) {
  const { listing, pending, error } = props;
  const permissions = listingDetailPermissions(listing, props.viewerId, props.active);
  const [shareOpen, setShareOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const firstParagraph = listing.description
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, ' ')
    .trim();
  const preview =
    firstParagraph && firstParagraph.length > 160
      ? `${firstParagraph.slice(0, 157).trimEnd()}…`
      : null;
  const initials =
    listing.seller.displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'S';
  return (
    <div className="cc-page cc-listing-detail">
      <nav className="cc-listing-breadcrumb" aria-label="Listing navigation">
        <Link className="cc-listing-back" to="/marketplace">
          <Icon name="chevron" />
          Marketplace
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/marketplace?categoryId=${encodeURIComponent(listing.category.id)}`}>
          {listing.category.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="cc-listing-current-crumb" aria-current="page">
          {listing.title}
        </span>
      </nav>
      {error ? (
        <div className="cc-alert cc-alert--danger cc-listing-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="cc-listing-workspace">
        <ListingGallery key={listing.id} media={listing.media} title={listing.title} />
        <section className="cc-listing-product-summary" aria-labelledby="listing-title">
          <p className="cc-listing-category">{listing.category.name}</p>
          <h1 id="listing-title">{listing.title}</h1>
          <p className="cc-listing-price">{formatPrice(listing.price, listing.currency)}</p>
          <div className="cc-listing-summary">
            <span>{readableEnum(listing.condition)}</span>
            <span aria-hidden="true" className="cc-listing-meta-separator" />
            <span>{listing.category.name}</span>
            <span
              className={`cc-listing-status cc-listing-status--${listing.status.toLowerCase()}`}
            >
              {listing.status === 'ACTIVE' ? 'Available' : readableEnum(listing.status)}
            </span>
          </div>
          {listing.status === 'SOLD' ? (
            <p className="cc-listing-sold-note" role="status">
              This item has been sold. New seller conversations are unavailable.
            </p>
          ) : null}
          {preview ? <p className="cc-listing-description-preview">{preview}</p> : null}
          <div className="cc-listing-secondary-actions" role="group" aria-label="Listing actions">
            {permissions.canSave ? (
              <div className="cc-listing-save">
                <BookmarkButton
                  presentation="commerce"
                  listingId={listing.id}
                  initialBookmarked={listing.isBookmarked}
                  onChange={props.onBookmarkChange}
                />
                <span aria-hidden="true">{listing.isBookmarked ? 'Saved' : 'Save'}</span>
              </div>
            ) : null}
            <Button variant="secondary" icon="share" onClick={() => setShareOpen(true)}>
              Share
            </Button>
            {permissions.canReport ? (
              <div className="cc-listing-report">
                <ReportAction targetId={listing.id} targetType="MARKETPLACE" />
              </div>
            ) : null}
          </div>
          <section className="cc-listing-information" aria-label="More about this listing">
            <section className="cc-listing-about" aria-labelledby="listing-about-heading">
              <h2 id="listing-about-heading">About this item</h2>
              <p>
                {listing.description.trim()
                  ? listing.description
                  : 'The seller has not added a description.'}
              </p>
            </section>
            <div className="cc-listing-information-facts">
              <section aria-labelledby="listing-details-heading">
                <h2 id="listing-details-heading">Details</h2>
                <dl className="cc-listing-facts">
                  <div>
                    <dt>Condition</dt>
                    <dd>{readableEnum(listing.condition)}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{listing.category.name}</dd>
                  </div>
                  <div>
                    <dt>Availability</dt>
                    <dd>
                      {listing.status === 'ACTIVE' ? 'Available' : readableEnum(listing.status)}
                    </dd>
                  </div>
                </dl>
              </section>
              <section aria-labelledby="listing-location-heading">
                <h2 id="listing-location-heading">Location &amp; timing</h2>
                <dl className="cc-listing-facts">
                  <div>
                    <dt>Location</dt>
                    <dd>{listing.location || 'Arrange with seller'}</dd>
                  </div>
                  <div>
                    <dt>Listed</dt>
                    <dd>{formatDate(listing.createdAt)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </section>
        </section>
        <div className="cc-listing-support">
          <section className="cc-listing-seller" aria-labelledby="listing-seller-heading">
            <div className="cc-listing-seller-identity">
              <h2 id="listing-seller-heading">{permissions.owned ? 'Your listing' : 'Seller'}</h2>
              <Link className="cc-listing-seller-profile" to={`/profile/${listing.seller.id}`}>
                <span className="cc-listing-avatar" aria-hidden="true">
                  {safePhoto(listing.seller.avatar) ? (
                    <StudentAvatar avatar={listing.seller.avatar} displayName={initials} />
                  ) : (
                    initials
                  )}
                </span>
                <span>
                  <strong>{listing.seller.displayName}</strong>
                  {listing.seller.department ? <span>{listing.seller.department.name}</span> : null}
                  <span className="cc-listing-profile-link">
                    View profile <Icon name="arrow" />
                  </span>
                </span>
              </Link>
            </div>
            {permissions.canMessage ? (
              <Button
                className="cc-listing-contact"
                icon="message"
                loading={pending === 'message'}
                disabled={pending !== null}
                onClick={() => void props.onMessage()}
              >
                {pending === 'message' ? 'Opening conversation…' : 'Message seller'}
              </Button>
            ) : null}
            {permissions.owned ? (
              <div className="cc-listing-owner-actions">
                {permissions.canEdit ? (
                  <>
                    <Link
                      className={`cc-button cc-button--secondary${pending ? ' cc-listing-action-disabled' : ''}`}
                      aria-disabled={pending !== null}
                      tabIndex={pending ? -1 : undefined}
                      onClick={(event) => {
                        if (pending) event.preventDefault();
                      }}
                      to={`/marketplace/${listing.id}/edit`}
                    >
                      Edit listing
                    </Link>
                    <Button
                      loading={pending === 'sold'}
                      disabled={pending !== null}
                      onClick={() => void props.onSold()}
                    >
                      {pending === 'sold' ? 'Updating…' : 'Mark as sold'}
                    </Button>
                  </>
                ) : null}
                {permissions.canArchive ? (
                  <Button
                    variant="ghost"
                    disabled={pending !== null}
                    onClick={() => setArchiveOpen(true)}
                  >
                    Archive listing
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
          <section className="cc-listing-safety" aria-labelledby="listing-safety-title">
            <h2 id="listing-safety-title">
              <Icon name="shield" /> Stay safe
            </h2>
            <ul>
              <li>Meet in a public place.</li>
              <li>Check the item before exchanging money.</li>
              <li>Keep your conversation in CampusConnect.</li>
            </ul>
          </section>
        </div>
      </div>
      <Link
        className="cc-listing-related"
        to={`/marketplace?categoryId=${encodeURIComponent(listing.category.id)}`}
      >
        Explore more in {listing.category.name}
        <Icon name="arrow" />
      </Link>
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this listing">
        <ShareActions
          includeRecordUrl
          className="cc-listing-share-options"
          record={{
            module: 'MARKETPLACE',
            id: listing.id,
            title: listing.title,
            description: listing.description,
            category: listing.category.name,
            price: formatPrice(listing.price, listing.currency),
            location: listing.location,
            status: readableEnum(listing.status),
          }}
        />
      </Modal>
      <Modal
        open={archiveOpen}
        onClose={() => {
          if (pending !== 'archive') setArchiveOpen(false);
        }}
        title="Archive this listing?"
        description="It will no longer appear publicly. Your listing data and media are preserved."
      >
        {error ? (
          <p role="alert" className="cc-listing-dialog-error">
            {error}
          </p>
        ) : null}
        <div className="cc-listing-confirm">
          <Button
            variant="secondary"
            disabled={pending !== null}
            onClick={() => setArchiveOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending === 'archive'}
            disabled={pending !== null}
            onClick={() =>
              void props.onArchive().then((success) => {
                if (success) setArchiveOpen(false);
              })
            }
          >
            Archive listing
          </Button>
        </div>
      </Modal>
    </div>
  );
}
