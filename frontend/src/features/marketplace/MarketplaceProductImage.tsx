import { useState } from 'react';
import { Icon } from '../../components/Icon';
import type { ListingMedia } from './marketplace.types';
import {
  isFailedMarketplaceImage,
  marketplaceImageCandidates,
  selectMarketplaceImage,
} from './marketplace-images';

export function MarketplaceProductImage({
  media,
  title,
}: {
  readonly media: readonly ListingMedia[];
  readonly title: string;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const imageUrl = selectMarketplaceImage(marketplaceImageCandidates(media), failed);
  return imageUrl ? (
    <div className="cc-market-image" data-image-state={loaded === imageUrl ? 'loaded' : 'loading'}>
      <span className="cc-market-image-pending" aria-hidden="true">
        <Icon name="store" />
        <span>Photo loading</span>
      </span>
      <img
        key={imageUrl}
        src={imageUrl}
        alt={title}
        loading="lazy"
        decoding="async"
        data-image-state={loaded === imageUrl ? 'loaded' : 'loading'}
        onLoad={() => setLoaded(imageUrl)}
        onError={(event) => {
          if (isFailedMarketplaceImage(event.currentTarget))
            setFailed((current) => (current.includes(imageUrl) ? current : [...current, imageUrl]));
        }}
      />
    </div>
  ) : (
    <div className="cc-market-product-fallback">
      <Icon name="store" />
      <span>Photo unavailable</span>
    </div>
  );
}
