import { Link } from 'react-router-dom';
import { BookmarkButton } from './BookmarkButton';
import { Icon } from '../../components/Icon';
import { formatShareMessage, whatsappShareUrl } from '../share/share';
import { formatPrice, readableEnum } from './marketplace-format';
import type { MarketplaceListing } from './marketplace.types';
import { MarketplaceProductImage } from './MarketplaceProductImage';

export function MarketplaceProductCard({
  listing,
  onOpen,
  onBookmarkChange,
}: {
  readonly listing: MarketplaceListing;
  readonly onOpen: (id: string) => void;
  readonly onBookmarkChange?: (bookmarked: boolean) => void;
}) {
  return (
    <article className="cc-market-product" data-listing-id={listing.id}>
      <Link
        className="cc-market-product-link"
        aria-label={listing.title}
        to={`/marketplace/${listing.id}`}
        onClick={(event) => {
          if (
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            onOpen(listing.id);
          }
        }}
      >
        <div className="cc-market-product-media">
          <MarketplaceProductImage media={listing.media} title={listing.title} />
          {listing.status !== 'ACTIVE' ? (
            <span className="cc-market-status">{readableEnum(listing.status)}</span>
          ) : null}
        </div>
        <div className="cc-market-product-body">
          <h3 title={listing.title}>{listing.title}</h3>
          <p className="cc-market-product-price">{formatPrice(listing.price, listing.currency)}</p>
          <p className="cc-market-product-condition">
            {listing.condition ? readableEnum(listing.condition) : 'Condition not specified'}
            <span aria-hidden="true"> · </span>
            <span>{listing.category.name}</span>
          </p>
        </div>
      </Link>
      <div className="cc-market-product-save">
        <BookmarkButton
          initialBookmarked={listing.isBookmarked}
          listingId={listing.id}
          onChange={onBookmarkChange}
          presentation="commerce"
        />
      </div>
      <div className="cc-market-product-footer">
        <span title={listing.location || 'Campus listing'}>
          {listing.location || 'Campus listing'}
        </span>
        <a
          aria-label={`Share ${listing.title} on WhatsApp`}
          className="cc-market-share"
          title="Share on WhatsApp"
          target="_blank"
          rel="noreferrer"
          href={whatsappShareUrl(
            formatShareMessage({
              module: 'MARKETPLACE',
              id: listing.id,
              title: listing.title,
              description: listing.description,
              category: listing.category.name,
              price: formatPrice(listing.price, listing.currency),
              location: listing.location,
              status: readableEnum(listing.status),
            }),
          )}
        >
          <Icon name="whatsapp" width="16" height="16" />
          <span>Share</span>
        </a>
      </div>
    </article>
  );
}
