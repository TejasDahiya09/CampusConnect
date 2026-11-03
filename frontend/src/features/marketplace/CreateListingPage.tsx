import { useEffect, useState } from 'react';
import { ApiClientError } from '../../services/api-client';
import { ListingForm } from './ListingForm';
import { ListingAssistant } from './ListingAssistant';
import { fileKey } from './marketplace-file';
import { createListing, getMarketplaceCategories, uploadListingImage } from './marketplace-service';
import type { MarketplaceCategory } from './marketplace.types';

interface CreateListingPageProps {
  readonly navigate: (path: string) => void;
}

export function CreateListingPage({ navigate }: CreateListingPageProps) {
  const [categories, setCategories] = useState<readonly MarketplaceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Readonly<Record<string, number>>>({});
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);

  useEffect(() => {
    void getMarketplaceCategories()
      .then(setCategories)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error ? loadError.message : 'Categories could not be loaded.',
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="cc-page max-w-4xl">
      <button
        className="cc-auth-link inline-flex"
        onClick={() => navigate('/marketplace')}
        type="button"
      >
        ← Back to marketplace
      </button>
      <h1 className="mt-6 text-3xl font-bold text-[var(--cc-text)] sm:text-4xl">
        Create a listing
      </h1>
      <p className="cc-page-description mt-2">
        Share clear item details. Seller ownership is assigned securely from your session.
      </p>
      {error ? <div className="cc-alert cc-alert--danger mt-5">{error}</div> : null}
      <section className="cc-form-surface mt-7">
        {isLoading ? (
          <p className="py-16 text-center text-[var(--cc-muted)]">Loading listing form…</p>
        ) : (
          <ListingForm
            assistant={(applySuggestion) => (
              <div className="mb-7">
                <ListingAssistant categories={categories} onApprove={applySuggestion} />
              </div>
            )}
            categories={categories}
            isSaving={isSaving}
            onCancel={() => navigate('/marketplace')}
            onFilesChange={setSelectedFiles}
            onSubmit={async (draft) => {
              setIsSaving(true);
              setError(null);
              try {
                const listingId = createdListingId ?? (await createListing(draft)).id;
                setCreatedListingId(listingId);
                for (const file of selectedFiles) {
                  const key = fileKey(file);
                  await uploadListingImage(listingId, file, (percentage) =>
                    setUploadProgress((current) => ({ ...current, [key]: percentage })),
                  );
                  setSelectedFiles((current) =>
                    current.filter((candidate) => fileKey(candidate) !== key),
                  );
                }
                navigate(`/marketplace/${listingId}`);
                return true;
              } catch (saveError) {
                setError(
                  saveError instanceof ApiClientError || saveError instanceof Error
                    ? saveError.message
                    : 'The listing or one of its images could not be saved. Retry to continue.',
                );
                return false;
              } finally {
                setIsSaving(false);
              }
            }}
            selectedFiles={selectedFiles}
            submitLabel="Publish listing"
            uploadProgress={uploadProgress}
          />
        )}
      </section>
    </main>
  );
}
