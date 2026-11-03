import { useCallback, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/ui';
import { isFailedMarketplaceImage, marketplaceImageCandidates } from './marketplace-images';
import type { ListingMedia } from './marketplace.types';

function GalleryPhoto({
  url,
  title,
  onFailure,
}: {
  readonly url: string;
  readonly title: string;
  readonly onFailure: (url: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="cc-listing-photo" data-image-state={loaded ? 'loaded' : 'loading'}>
      {!loaded ? (
        <span className="cc-listing-photo-loading" role="status">
          <Icon name="store" />
          Loading photo…
        </span>
      ) : null}
      <img
        src={url}
        alt={title}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={(event) => {
          if (isFailedMarketplaceImage(event.currentTarget)) onFailure(url);
        }}
      />
    </div>
  );
}

export function ListingGallery({
  media,
  title,
}: {
  readonly media: readonly ListingMedia[];
  readonly title: string;
}) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);
  const closeViewer = useCallback(() => setOpen(false), []);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const urls = marketplaceImageCandidates(media);
  const available = urls.filter((url) => !failed.includes(url));
  const selected = available.find((url) => url === selectedUrl) ?? available[0];
  const index = selected ? available.indexOf(selected) : -1;
  const selectedMedia = media.find((item) => item.url === selected);
  const ratio =
    selectedMedia?.width && selectedMedia.height
      ? selectedMedia.width / selectedMedia.height
      : null;
  const shape =
    ratio === null ? 'unknown' : ratio < 0.85 ? 'portrait' : ratio > 1.2 ? 'landscape' : 'square';
  const failure = (url: string) =>
    setFailed((current) => (current.includes(url) ? current : [...current, url]));
  const move = (offset: number) => {
    const next = available[Math.max(0, Math.min(available.length - 1, index + offset))];
    if (next) setSelectedUrl(next);
  };
  const controls = () =>
    available.length > 1 ? (
      <div className="cc-listing-gallery-controls">
        <button
          type="button"
          aria-label="Previous image"
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <Icon name="chevron" />
        </button>
        <button
          type="button"
          aria-label="Next image"
          disabled={index === available.length - 1}
          onClick={() => move(1)}
        >
          <Icon name="chevron" />
        </button>
      </div>
    ) : null;
  const thumbnails = () =>
    available.length > 1 ? (
      <div className="cc-listing-thumbnails" aria-label="Listing photos">
        {available.map((url, number) => (
          <button
            type="button"
            key={url}
            aria-label={`View image ${number + 1}`}
            aria-pressed={selected === url}
            onClick={() => setSelectedUrl(url)}
          >
            <img
              src={url}
              alt=""
              loading="lazy"
              onError={(event) => {
                if (isFailedMarketplaceImage(event.currentTarget)) failure(url);
              }}
            />
          </button>
        ))}
      </div>
    ) : null;
  const empty = (
    <div className="cc-listing-photo-empty">
      <Icon name="store" />
      <strong>{urls.length ? 'Photos unavailable' : 'No photos added'}</strong>
      <span>
        {urls.length
          ? 'The listing photos could not be loaded.'
          : 'The seller has not added photos for this item.'}
      </span>
    </div>
  );
  return (
    <section
      className={`cc-listing-gallery${available.length === 1 ? ' cc-listing-gallery--single' : ''}`}
      aria-label="Product image gallery"
      data-image-shape={shape}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      <div
        className="cc-gallery-stage cc-listing-gallery-stage"
        onPointerDown={(event) => {
          touch.current = { x: event.clientX, y: event.clientY };
          swiped.current = false;
        }}
        onPointerCancel={() => {
          touch.current = null;
        }}
        onPointerUp={(event) => {
          const start = touch.current;
          touch.current = null;
          if (
            start &&
            Math.abs(event.clientX - start.x) > 45 &&
            Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y) * 1.4
          ) {
            swiped.current = true;
            move(event.clientX < start.x ? 1 : -1);
          }
        }}
      >
        {selected ? (
          <button
            type="button"
            className="cc-listing-photo-open"
            aria-label="View larger image"
            title="View larger image"
            onClick={(event) => {
              if (swiped.current && event.detail > 0) {
                swiped.current = false;
                return;
              }
              swiped.current = false;
              setOpen(true);
            }}
          >
            <GalleryPhoto
              key={selected}
              url={selected}
              title={`${title} — image ${index + 1} of ${available.length}`}
              onFailure={failure}
            />
            <span className="cc-listing-zoom-hint" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" />
              </svg>
            </span>
          </button>
        ) : (
          empty
        )}
        {controls()}
        {selected && available.length > 1 ? (
          <p className="cc-listing-image-count" aria-live="polite">
            {index + 1} / {available.length}
          </p>
        ) : null}
      </div>
      {thumbnails()}
      <Modal open={open} onClose={closeViewer} title="Listing photos" description={title}>
        <div className="cc-listing-lightbox">
          <div className="cc-listing-lightbox-stage">
            {selected ? (
              <GalleryPhoto
                key={selected}
                url={selected}
                title={`${title} — image ${index + 1} of ${available.length}`}
                onFailure={failure}
              />
            ) : (
              empty
            )}
            {controls()}
          </div>
          {selected ? (
            <p className="cc-listing-lightbox-count" aria-live="polite">
              Image {index + 1} of {available.length}
            </p>
          ) : null}
          {thumbnails()}
        </div>
      </Modal>
    </section>
  );
}
