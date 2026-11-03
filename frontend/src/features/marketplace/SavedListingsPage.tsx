import { useEffect, useState } from 'react';
import { ApiClientError } from '../../services/api-client';
import { ListingCard } from './ListingCard';
import { getSavedListings } from './marketplace-service';
import type { MarketplaceListing } from './marketplace.types';

interface SavedListingsPageProps {
  readonly navigate: (path: string) => void;
}

const messageFor = (error: unknown): string =>
  error instanceof ApiClientError || error instanceof Error
    ? error.message
    : 'Saved listings could not be loaded.';

export function SavedListingsPage({ navigate }: SavedListingsPageProps) {
  const [listings, setListings] = useState<readonly MarketplaceListing[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setIsLoading(true);
        setError(null);
      }
    });
    void getSavedListings(page, 12)
      .then((result) => {
        if (!active) return;
        if (result.listings.length === 0 && page > 1 && result.pagination.totalPages < page) {
          setPage(Math.max(1, result.pagination.totalPages));
          return;
        }
        setListings(result.listings);
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
      })
      .catch((loadError: unknown) => {
        if (active) setError(messageFor(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const removeFromPage = (listingId: string, bookmarked: boolean) => {
    if (bookmarked) return;
    const remaining = listings.filter(({ id }) => id !== listingId);
    const nextTotal = Math.max(0, total - 1);
    setListings(remaining);
    setTotal(nextTotal);
    setTotalPages(Math.ceil(nextTotal / 12));
    if (remaining.length === 0 && page > 1) setPage(page - 1);
  };

  return (
    <main className="cc-page">
      <header>
        <p className="cc-eyebrow">Marketplace</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-[var(--cc-text)] sm:text-5xl">
          Saved listings
        </h1>
        <p className="cc-page-description mt-3">
          {isLoading
            ? 'Loading your saved items…'
            : `${total} saved listing${total === 1 ? '' : 's'}`}
        </p>
      </header>

      {error ? <div className="cc-alert cc-alert--danger mt-6">{error}</div> : null}

      {isLoading ? (
        <div className="grid min-h-72 place-items-center text-[var(--cc-muted)]">
          Loading saved listings…
        </div>
      ) : listings.length === 0 ? (
        <div className="cc-empty-compact mt-8 py-20">
          <p className="text-xl font-semibold text-[var(--cc-text)]">No saved listings yet.</p>
          <p className="mt-2 text-sm text-[var(--cc-muted)]">
            Save useful Marketplace items and they will appear here.
          </p>
          <button
            className="cc-button cc-button--primary mt-6"
            onClick={() => navigate('/marketplace')}
            type="button"
          >
            Browse marketplace
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onBookmarkChange={(bookmarked) => removeFromPage(listing.id, bookmarked)}
              onOpen={(id) => navigate(`/marketplace/${id}`)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          className="mt-8 flex items-center justify-center gap-4"
          aria-label="Saved listings pagination"
        >
          <button
            className="cc-button cc-button--secondary disabled:opacity-40"
            disabled={page === 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--cc-muted)]">
            Page {page} of {totalPages}
          </span>
          <button
            className="cc-button cc-button--secondary disabled:opacity-40"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Next
          </button>
        </nav>
      ) : null}
    </main>
  );
}
