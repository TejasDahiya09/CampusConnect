import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { fileKey } from './marketplace-file';

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumBytes = 5 * 1024 * 1024;

interface ImagePickerProps {
  readonly disabled: boolean;
  readonly existingImageCount: number;
  readonly files: readonly File[];
  readonly onChange: (files: readonly File[]) => void;
  readonly progress: Readonly<Record<string, number>>;
}

export function ImagePicker({
  disabled,
  existingImageCount,
  files,
  onChange,
  progress,
}: ImagePickerProps) {
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(
    () => files.map((file) => ({ file, key: fileKey(file), url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(
    () => () => {
      previews.forEach(({ url }) => URL.revokeObjectURL(url));
    },
    [previews],
  );

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = '';
    const invalid = incoming.find(
      (file) => !supportedTypes.has(file.type) || file.size > maximumBytes,
    );
    if (invalid !== undefined) {
      setError('Use JPEG, PNG, or WebP images no larger than 5 MB each.');
      return;
    }
    const available = 6 - existingImageCount - files.length;
    if (incoming.length > available) {
      setError(`You can add ${Math.max(available, 0)} more image${available === 1 ? '' : 's'}.`);
      return;
    }
    const existingKeys = new Set(files.map(fileKey));
    const unique = incoming.filter((file) => !existingKeys.has(fileKey(file)));
    setError(null);
    onChange([...files, ...unique]);
  };

  return (
    <div className="cc-upload-surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--cc-text)]">Listing images</p>
          <p className="mt-1 text-xs text-[var(--cc-muted)]">
            Up to 6 JPEG, PNG, or WebP files. Maximum 5 MB each.
          </p>
        </div>
        <label className="cc-button cc-button--secondary cursor-pointer">
          Select images
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || existingImageCount + files.length >= 6}
            multiple
            onChange={selectFiles}
            type="file"
          />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--cc-danger)]">{error}</p> : null}
      {previews.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map(({ file, key, url }) => (
            <div
              className="relative overflow-hidden rounded-[var(--cc-radius-md)] border border-[var(--cc-border)] bg-[var(--cc-panel-muted)]"
              key={key}
            >
              <img
                alt={`Preview of ${file.name}`}
                className="aspect-square w-full object-cover"
                src={url}
              />
              <div className="p-2">
                <p className="truncate text-xs text-[var(--cc-text-soft)]">{file.name}</p>
                <p className="mt-1 text-xs text-[var(--cc-primary)]">
                  {progress[key] === undefined ? 'Ready' : `${progress[key]}% uploaded`}
                </p>
              </div>
              <button
                aria-label={`Remove ${file.name}`}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-[var(--cc-overlay)] text-sm text-white"
                disabled={disabled}
                onClick={() => onChange(files.filter((candidate) => fileKey(candidate) !== key))}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
