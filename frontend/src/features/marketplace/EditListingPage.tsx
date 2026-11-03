import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ListingForm } from './ListingForm';
import { fileKey } from './marketplace-file';
import { ListingMediaManager } from './ListingMediaManager';
import {
  getListing,
  getMarketplaceCategories,
  updateListing,
  uploadListingImage,
} from './marketplace-service';
import type { MarketplaceCategory, MarketplaceListing } from './marketplace.types';

interface EditListingPageProps {
  readonly id: string;
  readonly navigate: (path: string) => void;
}

export function EditListingPage({ id, navigate }: EditListingPageProps) {
  const { applicationUser } = useAuth();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [categories, setCategories] = useState<readonly MarketplaceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Readonly<Record<string, number>>>({});

  useEffect(() => {
    void Promise.all([getListing(id), getMarketplaceCategories()])
      .then(([nextListing, nextCategories]) => {
        setListing(nextListing);
        setCategories(nextCategories);
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error ? loadError.message : 'The listing could not be loaded.',
        ),
      )
      .finally(() => setIsLoading(false));
  }, [id]);

  const editable =
    listing !== null && listing.sellerId === applicationUser?.id && listing.status === 'ACTIVE';
  const hasConsentValue = typeof listing?.featuredOnLanding === 'boolean';
  return (
    <main className="cc-page max-w-3xl">
      <button
        className="cc-auth-link inline-flex"
        onClick={() => navigate(`/marketplace/${id}`)}
        type="button"
      >
        ← Back to listing
      </button>
      <h1 className="mt-6 text-3xl font-bold text-[var(--cc-text)] sm:text-4xl">Edit listing</h1>
      {error ? <div className="cc-alert cc-alert--danger mt-5">{error}</div> : null}
      <section className="cc-form-surface mt-7">
        {isLoading ? (
          <p className="py-16 text-center text-[var(--cc-muted)]">Loading listing…</p>
        ) : !editable || listing === null ? (
          <div className="py-14 text-center">
            <p className="text-lg font-semibold text-[var(--cc-text)]">
              This listing is not editable.
            </p>
            <p className="mt-2 text-sm text-[var(--cc-muted)]">
              Only the owner can edit an active listing.
            </p>
          </div>
        ) : !hasConsentValue ? (
          <div className="cc-alert cc-alert--danger">
            This owner response is missing the Featured Posts consent value. Editing is disabled to
            avoid changing your consent unintentionally.
          </div>
        ) : (
          <>
            <ListingMediaManager
              disabled={isSaving}
              listingId={id}
              media={listing.media}
              onChange={(media) => setListing({ ...listing, media })}
              onError={setError}
            />
            <ListingForm
              allowStatusChange
              categories={categories}
              existingImageCount={listing.media.length}
              initialValue={{
                categoryId: listing.category.id,
                condition: listing.condition,
                currency: listing.currency,
                description: listing.description,
                featuredOnLanding: listing.featuredOnLanding,
                location: listing.location,
                price: listing.price,
                status: listing.status,
                title: listing.title,
              }}
              isSaving={isSaving}
              onCancel={() => navigate(`/marketplace/${id}`)}
              onFilesChange={setSelectedFiles}
              onSubmit={async (draft) => {
                setIsSaving(true);
                setError(null);
                try {
                  const updated = await updateListing(id, draft);
                  for (const file of selectedFiles) {
                    const key = fileKey(file);
                    await uploadListingImage(id, file, (percentage) =>
                      setUploadProgress((current) => ({ ...current, [key]: percentage })),
                    );
                    setSelectedFiles((current) =>
                      current.filter((candidate) => fileKey(candidate) !== key),
                    );
                  }
                  navigate(`/marketplace/${updated.id}`);
                  return true;
                } catch (saveError) {
                  setError(
                    saveError instanceof Error
                      ? saveError.message
                      : 'The listing could not be updated.',
                  );
                  return false;
                } finally {
                  setIsSaving(false);
                }
              }}
              selectedFiles={selectedFiles}
              submitLabel="Save changes"
              uploadProgress={uploadProgress}
            />
          </>
        )}
      </section>
    </main>
  );
}
