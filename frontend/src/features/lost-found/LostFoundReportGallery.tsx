import { useCallback, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/ui';
import { LostFoundPhoto } from './LostFoundPhoto';
import { reportPhotoCandidates } from './lost-found-presentation';
import type { LostFoundImage } from './lost-found.types';

export function LostFoundReportGallery({
  images,
  title,
}: {
  readonly images: readonly LostFoundImage[];
  readonly title: string;
}) {
  const candidates = reportPhotoCandidates(images);
  const [failed, setFailed] = useState<readonly string[]>([]),
    [selection, setSelection] = useState<string | null>(null),
    [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const touch = useRef<{ x: number; y: number } | null>(null),
    swiped = useRef(false);
  const available = candidates.filter((image) => !failed.includes(image.url!));
  const selected = available.find((image) => image.url === selection) ?? available[0];
  const index = selected ? available.indexOf(selected) : -1;
  const ratio = selected?.width && selected.height ? selected.width / selected.height : null;
  const shape =
    ratio === null ? 'unknown' : ratio < 0.85 ? 'portrait' : ratio > 1.2 ? 'landscape' : 'square';
  const fail = (url: string) =>
    setFailed((current) => (current.includes(url) ? current : [...current, url]));
  const move = (direction: number) => {
    const next = available[Math.max(0, Math.min(available.length - 1, index + direction))];
    if (next) setSelection(next.url);
  };
  const controls = () =>
    available.length > 1 ? (
      <div className="cc-lf-gallery-arrows">
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
      <div className="cc-lf-thumbnails" aria-label="Report photos">
        {available.map((image, i) => (
          <button
            key={image.url}
            type="button"
            aria-label={`View image ${i + 1}`}
            aria-pressed={selected?.url === image.url}
            onClick={() => setSelection(image.url)}
          >
            <img
              src={image.url!}
              alt=""
              loading="lazy"
              onError={(event) => {
                if (event.currentTarget.complete && event.currentTarget.naturalWidth === 0)
                  fail(image.url!);
              }}
            />
          </button>
        ))}
      </div>
    ) : null;
  const empty = (
    <div className="cc-lf-photo-empty">
      <Icon name="search" />
      <strong>{candidates.length ? 'Photos unavailable' : 'No photos added'}</strong>
      <span>
        {candidates.length
          ? 'The report photos could not be loaded.'
          : 'The reporter has not added photos for this item.'}
      </span>
    </div>
  );
  const photo = () =>
    selected ? (
      <LostFoundPhoto
        key={selected.url}
        url={selected.url!}
        title={`${title} — image ${index + 1} of ${available.length}`}
        onFailure={fail}
      />
    ) : (
      empty
    );
  return (
    <section
      className="cc-lf-gallery"
      aria-label="Report image gallery"
      data-image-shape={shape}
      data-single={available.length === 1}
      onKeyDown={(event) => {
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      <div
        className="cc-lf-gallery-stage"
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
            className="cc-lf-photo-open"
            type="button"
            aria-label="View larger image"
            onClick={(event) => {
              if (swiped.current && event.detail > 0) {
                swiped.current = false;
                return;
              }
              swiped.current = false;
              setOpen(true);
            }}
          >
            {photo()}
            <span className="cc-lf-expand" aria-hidden="true">
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
          <p className="cc-lf-image-count" aria-live="polite">
            {index + 1} / {available.length}
          </p>
        ) : null}
      </div>
      {thumbnails()}
      <Modal open={open} onClose={close} title="Report photos" description={title}>
        <div className="cc-lf-lightbox">
          <div className="cc-lf-lightbox-stage">
            {photo()}
            {controls()}
          </div>
          {selected ? (
            <p className="cc-lf-lightbox-count" aria-live="polite">
              Image {index + 1} of {available.length}
            </p>
          ) : null}
          {thumbnails()}
        </div>
      </Modal>
    </section>
  );
}
