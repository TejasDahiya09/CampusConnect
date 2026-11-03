import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/ui';
import { lostFoundApi } from './lost-found-service';
import { lostFoundFileKey, reportImageUrl, type LostFoundImage } from './lost-found.types';

export function LostFoundImagePicker({
  disabled,
  existingCount,
  files,
  onChange,
  progress,
}: {
  readonly disabled: boolean;
  readonly existingCount: number;
  readonly files: readonly File[];
  readonly onChange: (files: readonly File[]) => void;
  readonly progress: Readonly<Record<string, number>>;
}) {
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(
    () =>
      files.map((file) => ({ file, key: lostFoundFileKey(file), url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (
      incoming.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 5 * 1024 * 1024,
      )
    ) {
      setError('Use JPEG, PNG, or WebP images no larger than 5 MB each.');
      return;
    }
    const available = 4 - existingCount - files.length;
    if (incoming.length > available) {
      setError(`You can add ${Math.max(available, 0)} more image${available === 1 ? '' : 's'}.`);
      return;
    }
    const keys = new Set(files.map(lostFoundFileKey));
    onChange([...files, ...incoming.filter((file) => !keys.has(lostFoundFileKey(file)))]);
    setError(null);
  };
  return (
    <div className="cc-upload-surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--cc-text)]">Item images</p>
          <p className="mt-1 text-xs text-[var(--cc-muted)]">
            Up to 4 JPEG, PNG, or WebP files, 5 MB each.
          </p>
        </div>
        <label className="cc-button cc-button--secondary cursor-pointer">
          Select images
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || existingCount + files.length >= 4}
            multiple
            onChange={select}
            type="file"
          />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--cc-danger)]">{error}</p> : null}
      {previews.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {previews.map(({ file, key, url }) => (
            <div
              className="overflow-hidden rounded-[var(--cc-radius-sm)] border border-[var(--cc-border)]"
              key={key}
            >
              <img
                alt={`Preview of ${file.name}`}
                className="aspect-square w-full object-cover"
                src={url}
              />
              <div className="p-2">
                <p className="truncate text-xs">{file.name}</p>
                <p className="text-xs text-[var(--cc-primary)]">
                  {progress[key] === undefined ? 'Ready' : `${progress[key]}% uploaded`}
                </p>
                <button
                  className="mt-1 text-xs text-[var(--cc-danger)]"
                  disabled={disabled}
                  onClick={() => onChange(files.filter((item) => lostFoundFileKey(item) !== key))}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LostFoundMediaManager({
  disabled,
  media,
  onChange,
  onError,
  reportId,
}: {
  readonly disabled: boolean;
  readonly media: readonly LostFoundImage[];
  readonly onChange: (media: readonly LostFoundImage[]) => void;
  readonly onError: (message: string) => void;
  readonly reportId: string;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const reorder = async (next: readonly LostFoundImage[]) => {
    try {
      onChange(
        await lostFoundApi.reorderMedia(
          reportId,
          next.map(({ id }) => id),
        ),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Image order could not be saved.');
    }
  };
  if (!media.length) return null;
  return (
    <div className="cc-upload-surface mb-5">
      <h2 className="font-semibold">Current images</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {media.map((image, index) => (
          <div
            className="overflow-hidden rounded-[var(--cc-radius-sm)] border border-[var(--cc-border)]"
            key={image.id}
          >
            {reportImageUrl(image) && !failed.has(image.id) ? (
              <img
                alt={`Report image ${index + 1}`}
                className="aspect-square w-full object-cover"
                onError={() => setFailed((current) => new Set(current).add(image.id))}
                src={reportImageUrl(image)!}
              />
            ) : (
              <div className="grid aspect-square place-items-center text-xs text-[var(--cc-muted)]">
                Image unavailable
              </div>
            )}
            <div className="flex flex-wrap gap-2 p-2">
              <Button
                disabled={disabled || index === 0}
                onClick={() => void reorder([image, ...media.filter(({ id }) => id !== image.id)])}
                type="button"
                variant="ghost"
              >
                Primary
              </Button>
              <Button
                disabled={disabled}
                onClick={() =>
                  void lostFoundApi
                    .deleteMedia(reportId, image.id)
                    .then(() => onChange(media.filter(({ id }) => id !== image.id)))
                    .catch((error: unknown) =>
                      onError(
                        error instanceof Error ? error.message : 'Image could not be removed.',
                      ),
                    )
                }
                type="button"
                variant="danger"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { LostFoundReportGallery as LostFoundGallery } from './LostFoundReportGallery';
