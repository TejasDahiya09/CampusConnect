import { useState } from 'react';
import { formatDate, formatPrice, readableEnum } from './marketplace-format';
import type { MarketplaceListing } from './marketplace.types';
import { BookmarkButton } from './BookmarkButton';
import { WhatsAppShareLink } from '../share/ShareActions';
import { MarketplaceProductCard } from './MarketplaceProductCard';

interface ListingCardProps {
  readonly variant?: 'default' | 'commerce';
  readonly listing: MarketplaceListing;
  readonly onBookmarkChange?: (bookmarked: boolean) => void;
  readonly onOpen: (id: string) => void;
}

export function ListingCard({
  listing,
  onBookmarkChange,
  onOpen,
  variant = 'default',
}: ListingCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = listing.media[0]?.url;

  if (variant === 'commerce')
    return (
      <MarketplaceProductCard
        listing={listing}
        onBookmarkChange={onBookmarkChange}
        onOpen={onOpen}
      />
    );

  return (
    <article className="cc-feature-card group relative overflow-hidden">
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <WhatsAppShareLink
          record={{
            category: listing.category.name,
            description: listing.description,
            id: listing.id,
            location: listing.location,
            module: 'MARKETPLACE',
            price: formatPrice(listing.price, listing.currency),
            status: readableEnum(listing.status),
            title: listing.title,
          }}
        />
        <BookmarkButton
          initialBookmarked={listing.isBookmarked}
          listingId={listing.id}
          onChange={onBookmarkChange}
        />
      </div>
      <button className="block w-full text-left" onClick={() => onOpen(listing.id)} type="button">
        {imageUrl && !imageFailed ? (
          <img
            alt={listing.title}
            className="cc-feature-card-media aspect-[4/3] w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
            src={imageUrl}
          />
        ) : (
          <div className="cc-feature-card-placeholder grid aspect-[4/3] place-items-center text-[var(--cc-muted)]">
            <div className="text-center">
              <span className="text-4xl" aria-hidden="true">
                ◇
              </span>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em]">No image</p>
            </div>
          </div>
        )}
        <div className="cc-feature-card-body">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="cc-category-pill">{listing.category.name}</span>
            <span className="text-[var(--cc-muted)]">{formatDate(listing.createdAt)}</span>
          </div>
          <h2 className="cc-feature-card-title mt-4 line-clamp-2 group-hover:text-[var(--cc-primary)]">
            {listing.title}
          </h2>
          <p className="mt-2 text-xl font-bold tracking-tight text-[var(--cc-text)]">
            {formatPrice(listing.price, listing.currency)}
          </p>
          <div className="cc-feature-card-meta mt-4">
            <span>{readableEnum(listing.condition)}</span>
            <span>{readableEnum(listing.status)}</span>
          </div>
        </div>
      </button>
    </article>
  );
}
