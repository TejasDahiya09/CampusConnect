import { useState } from 'react';
import { deleteListingImage, reorderListingImages } from './marketplace-service';
import type { ListingMedia } from './marketplace.types';

interface ListingMediaManagerProps {
  readonly disabled: boolean;
  readonly listingId: string;
  readonly media: readonly ListingMedia[];
  readonly onChange: (media: readonly ListingMedia[]) => void;
  readonly onError: (message: string) => void;
}

export function ListingMediaManager({
  disabled,
  listingId,
  media,
  onChange,
  onError,
}: ListingMediaManagerProps) {
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  const applyOrder = async (next: readonly ListingMedia[]) => {
    try {
      onChange(
        await reorderListingImages(
          listingId,
          next.map(({ id }) => id),
        ),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The image order could not be saved.');
    }
  };

  const move = (index: number, target: number) => {
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(target, 0, item);
    void applyOrder(next);
  };

  if (media.length === 0) return null;

  return (
    <div className="cc-upload-surface mb-6">
      <h2 className="text-sm font-medium text-[var(--cc-text)]">Current images</h2>
      <p className="mt-1 text-xs text-[var(--cc-muted)]">
        The first image is the primary Marketplace image.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {media.map((image, index) => (
          <article
            className="overflow-hidden rounded-[var(--cc-radius-md)] border border-[var(--cc-border)] bg-[var(--cc-panel-muted)]"
            key={image.id}
          >
            {image.url && !failedIds.has(image.id) ? (
              <img
                alt={`Listing image ${index + 1}`}
                className="aspect-square w-full object-cover"
                onError={() => setFailedIds((current) => new Set(current).add(image.id))}
                src={image.url}
              />
            ) : (
              <div className="grid aspect-square place-items-center text-xs text-[var(--cc-muted)]">
                Image unavailable
              </div>
            )}
            <div className="p-3">
              <p className="text-xs font-medium text-[var(--cc-primary)]">
                {index === 0 ? 'Primary image' : `Image ${index + 1}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {index > 0 ? (
                  <button
                    className="cc-button cc-button--ghost min-h-0 px-2 py-1 text-xs"
                    disabled={disabled}
                    onClick={() =>
                      void applyOrder([image, ...media.filter(({ id }) => id !== image.id)])
                    }
                    type="button"
                  >
                    Make primary
                  </button>
                ) : null}
                <button
                  aria-label="Move image left"
                  className="cc-button cc-button--ghost min-h-0 px-2 py-1 text-xs disabled:opacity-30"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                  type="button"
                >
                  ←
                </button>
                <button
                  aria-label="Move image right"
                  className="cc-button cc-button--ghost min-h-0 px-2 py-1 text-xs disabled:opacity-30"
                  disabled={disabled || index === media.length - 1}
                  onClick={() => move(index, index + 1)}
                  type="button"
                >
                  →
                </button>
                <button
                  className="cc-button cc-button--danger min-h-0 px-2 py-1 text-xs"
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm('Remove this listing image?'))
                      void deleteListingImage(listingId, image.id)
                        .then(() => onChange(media.filter(({ id }) => id !== image.id)))
                        .catch((error: unknown) =>
                          onError(
                            error instanceof Error
                              ? error.message
                              : 'The image could not be removed.',
                          ),
                        );
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
