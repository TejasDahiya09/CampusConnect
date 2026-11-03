import { useState, type FormEvent, type ReactNode } from 'react';
import { conditions, readableEnum, statuses } from './marketplace-format';
import type { ListingDraft, MarketplaceCategory } from './marketplace.types';
import { ImagePicker } from './ImagePicker';
import { FeaturedOnLandingField } from '../../components/FeaturedOnLandingField';

interface ListingFormProps {
  readonly allowStatusChange?: boolean;
  readonly assistant?: (applySuggestion: (suggestion: Partial<ListingDraft>) => void) => ReactNode;
  readonly categories: readonly MarketplaceCategory[];
  readonly existingImageCount?: number;
  readonly initialValue?: ListingDraft;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onFilesChange: (files: readonly File[]) => void;
  readonly onSubmit: (draft: ListingDraft) => Promise<boolean>;
  readonly submitLabel: string;
  readonly selectedFiles: readonly File[];
  readonly uploadProgress?: Readonly<Record<string, number>>;
}

const emptyDraft: ListingDraft = {
  categoryId: '',
  condition: 'GOOD',
  currency: 'INR',
  description: '',
  featuredOnLanding: false,
  location: null,
  price: '',
  status: 'ACTIVE',
  title: '',
};

const inputClass = 'cc-field mt-2 px-3.5 py-3 text-sm';

export function ListingForm({
  allowStatusChange = false,
  assistant,
  categories,
  existingImageCount = 0,
  initialValue = emptyDraft,
  isSaving,
  onCancel,
  onFilesChange,
  onSubmit,
  submitLabel,
  selectedFiles,
  uploadProgress = {},
}: ListingFormProps) {
  const [draft, setDraft] = useState(initialValue);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({
      ...draft,
      currency: draft.currency.trim().toUpperCase(),
      description: draft.description.trim(),
      location: draft.location?.trim() || null,
      price: draft.price.trim(),
      title: draft.title.trim(),
    });
  };

  return (
    <>
      {assistant?.((suggestion) => setDraft((current) => ({ ...current, ...suggestion })))}
      <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
        <label className="cc-label">
          Title
          <input
            className={inputClass}
            disabled={isSaving}
            maxLength={160}
            minLength={3}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="What are you selling?"
            required
            value={draft.title}
          />
        </label>

        <label className="cc-label">
          Description
          <textarea
            className={`${inputClass} min-h-36 resize-y`}
            disabled={isSaving}
            maxLength={10_000}
            minLength={10}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="Describe the item, its age, and anything a buyer should know."
            required
            value={draft.description}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="cc-label">
            Category
            <select
              className={inputClass}
              disabled={isSaving}
              onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
              required
              value={draft.categoryId}
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="cc-label">
            Condition
            <select
              className={inputClass}
              disabled={isSaving}
              onChange={(event) =>
                setDraft({ ...draft, condition: event.target.value as ListingDraft['condition'] })
              }
              value={draft.condition}
            >
              {conditions.map((condition) => (
                <option key={condition} value={condition}>
                  {readableEnum(condition)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="cc-label sm:col-span-2">
            Price
            <input
              className={inputClass}
              disabled={isSaving}
              inputMode="decimal"
              min="0"
              onChange={(event) => setDraft({ ...draft, price: event.target.value })}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
              value={draft.price}
            />
          </label>
          <label className="cc-label">
            Currency
            <input
              className={inputClass}
              disabled={isSaving}
              maxLength={3}
              minLength={3}
              onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
              pattern="[A-Za-z]{3}"
              required
              value={draft.currency}
            />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="cc-label">
            Campus location <span className="text-[var(--cc-subtle)]">(optional)</span>
            <input
              className={inputClass}
              disabled={isSaving}
              maxLength={255}
              onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              placeholder="Library gate, North Campus…"
              value={draft.location ?? ''}
            />
          </label>
          <label className="cc-label">
            Status
            <select
              className={inputClass}
              disabled={isSaving || !allowStatusChange || initialValue.status !== 'ACTIVE'}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as ListingDraft['status'] })
              }
              value={draft.status}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {readableEnum(status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ImagePicker
          disabled={isSaving}
          existingImageCount={existingImageCount}
          files={selectedFiles}
          onChange={onFilesChange}
          progress={uploadProgress}
        />

        <FeaturedOnLandingField
          disabled={isSaving}
          onChange={(featuredOnLanding) => setDraft({ ...draft, featuredOnLanding })}
          value={draft.featuredOnLanding}
        />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="cc-button cc-button--secondary"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button className="cc-button cc-button--primary" disabled={isSaving} type="submit">
            {isSaving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </>
  );
}
